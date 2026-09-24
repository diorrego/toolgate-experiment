use super::json::value_profile;
use serde_json::{Value, json};
use std::collections::{BTreeSet, HashSet};

pub(super) fn profile(root: &Value) -> Result<(), &'static str> {
    if !value_profile(root) {
        return Err("schema limits");
    }
    fn walk(
        root: &Value,
        node: &Value,
        seen: &HashSet<String>,
        depth: usize,
    ) -> Result<(), &'static str> {
        if depth > 64 {
            return Err("schema recursion");
        };
        if node.is_boolean() {
            return Ok(());
        };
        let m = node.as_object().ok_or("invalid schema")?;
        let supported = "$schema $id $defs $ref type properties required additionalProperties enum const minimum maximum exclusiveMinimum exclusiveMaximum minLength maxLength minItems maxItems items minProperties maxProperties allOf anyOf oneOf title description default examples deprecated readOnly writeOnly format pattern";
        if root["$schema"] == "http://json-schema.org/draft-07/schema#"
            && m.contains_key("$ref")
            && m.keys().any(|k| {
                !"$ref title description default examples deprecated readOnly writeOnly format"
                    .split_whitespace()
                    .any(|allowed| allowed == k)
            })
        {
            return Err("draft-07 ref siblings outside common subset");
        }
        for (k, v) in m {
            if !supported.split_whitespace().any(|s| s == k) {
                return Err("unsupported schema");
            };
            match k.as_str() {
                "pattern" => {
                    if !WOKU_PATTERNS.contains(&v.as_str().ok_or("invalid pattern")?) {
                        return Err("unsupported pattern");
                    }
                }
                "$schema" => {
                    if v != "https://json-schema.org/draft/2020-12/schema"
                        && v != "http://json-schema.org/draft-07/schema#"
                    {
                        return Err("schema dialect");
                    }
                }
                "$ref" => {
                    let reference = v.as_str().ok_or("schema reference")?;
                    if !reference.starts_with("#/") || seen.contains(reference) {
                        return Err("schema reference");
                    };
                    let target = root.pointer(&reference[1..]).ok_or("schema reference")?;
                    let mut next = seen.clone();
                    next.insert(reference.into());
                    walk(root, target, &next, depth + 1)?;
                }
                "properties" | "$defs" => {
                    for child in v.as_object().ok_or("schema map")?.values() {
                        walk(root, child, seen, depth + 1)?
                    }
                }
                "items" | "additionalProperties" => walk(root, v, seen, depth + 1)?,
                "allOf" | "anyOf" | "oneOf" => {
                    for child in v.as_array().ok_or("schema branches")? {
                        walk(root, child, seen, depth + 1)?
                    }
                }
                _ => {}
            }
        }
        Ok(())
    }
    walk(root, root, &HashSet::new(), 0)
}
pub(super) fn compile(schema: &Value) -> Result<jsonschema::Validator, &'static str> {
    profile(schema)?;
    let mut compiled = schema.clone();
    normalize_patterns(&mut compiled);
    jsonschema::options()
        .with_draft(jsonschema::Draft::Draft202012)
        .should_validate_formats(false)
        .build(&compiled)
        .map_err(|_| "invalid schema")
}
fn escaped(s: &str) -> String {
    s.replace('~', "~0").replace('/', "~1")
}
pub(super) fn validate(schema: &jsonschema::Validator, args: &Value) -> (Vec<Value>, Vec<String>) {
    if !value_profile(args) || !args.is_object() {
        return (
            vec![
                json!({"code":"unsupported_value","instance_path":"","schema_path":"#","message_key":"toolgate.validation.unsupported_value"}),
            ],
            vec![],
        );
    }
    let mut issues = Vec::new();
    let mut missing = BTreeSet::new();
    for error in schema.iter_errors(args) {
        let path = error.instance_path().to_string();
        let schema_path = error.schema_path().to_string();
        let keyword = schema_path.rsplit('/').next().unwrap_or("");
        let code = match keyword {
            "required" => "required",
            "type" => "type",
            "enum" => "enum",
            "const" => "const",
            "additionalProperties" => "additional_property",
            "minimum" | "exclusiveMinimum" => "minimum",
            "maximum" | "exclusiveMaximum" => "maximum",
            "minLength" | "maxLength" => "length",
            "items" | "minItems" | "maxItems" => "items",
            "oneOf" => "one_of",
            "anyOf" => "any_of",
            "allOf" => "all_of",
            _ => "unsupported_value",
        };
        let instance =
            if let jsonschema::error::ValidationErrorKind::Required { property } = error.kind() {
                let property = property.as_str().unwrap_or("");
                let p = format!("{path}/{}", escaped(property));
                missing.insert(p.clone());
                p
            } else {
                path
            };
        issues.push(json!({"code":code,"instance_path":instance,"schema_path":format!("#{schema_path}"),"message_key":format!("toolgate.validation.{code}")}));
    }
    issues.sort_by_key(|v| {
        (
            v["instance_path"].as_str().unwrap_or("").to_owned(),
            v["schema_path"].as_str().unwrap_or("").to_owned(),
            v["code"].as_str().unwrap_or("").to_owned(),
        )
    });
    issues.dedup();
    issues.truncate(128);
    (issues, missing.into_iter().take(128).collect())
}

// Finite catalog vocabulary; arbitrary backtracking expressions remain rejected.
const WOKU_PATTERNS: &[&str] = &[
    r"^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$",
    r"\S",
    r"^(?=.*[0-9])[+]?[0-9()\-\s.]+$",
    r"^[a-f0-9]{24}$",
    r"^[0-9a-fA-F]{24}$",
    r"\D",
];
fn normalize_patterns(value: &mut Value) {
    if let Some(map) = value.as_object_mut() {
        if let Some(pattern) = map.get_mut("pattern")
            && let Some(text) = pattern.as_str()
        {
            let spaces =
                r"\x09-\x0d\x20\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";
            let translated = text
                .replace(r"\D", "[^0-9]")
                .replace(r"\S", &format!("[^{spaces}]"))
                .replace(r"\s", &format!("[{spaces}]"))
                .replace(".*", r"[^\n\r\u2028\u2029]*");
            *pattern = Value::String(translated);
        }
        // Traverse schema positions only; annotation/example objects are data.
        for (key, child) in map.iter_mut() {
            match key.as_str() {
                "properties" | "$defs" => {
                    if let Some(entries) = child.as_object_mut() {
                        for node in entries.values_mut() {
                            normalize_patterns(node);
                        }
                    }
                }
                "items" | "additionalProperties" => normalize_patterns(child),
                "allOf" | "anyOf" | "oneOf" => {
                    if let Some(entries) = child.as_array_mut() {
                        for node in entries {
                            normalize_patterns(node);
                        }
                    }
                }
                _ => {}
            }
        }
    }
}
#[cfg(test)]
mod woku_pattern_tests {
    use super::*;
    #[test]
    fn draft7_ref_validation_siblings_rejected() {
        let schema = json!({"$schema":"http://json-schema.org/draft-07/schema#","type":"object","$defs":{"s":{"type":"string"}},"properties":{"s":{"$ref":"#/$defs/s","minLength":3}}});
        assert!(compile(&schema).is_err());
    }
    #[test]
    fn ecmascript_parity() {
        let cases: Value =
            serde_json::from_str(include_str!("../../../shared/fixtures/woku-patterns.json"))
                .expect("fixture");
        for case in cases.as_array().expect("cases") {
            let schema = json!({"type":"object","properties":{"value":{"type":"string","pattern":case["pattern"]}}});
            let validator = compile(&schema).expect("pattern compiled");
            assert_eq!(
                validator.is_valid(&json!({"value":case["value"]})),
                case["valid"].as_bool().expect("bool"),
                "{case}"
            );
        }
    }
}
