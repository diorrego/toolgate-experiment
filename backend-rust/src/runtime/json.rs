use serde::de::{self, Deserialize, Deserializer, MapAccess, SeqAccess, Visitor};
use serde_json::{Map, Number, Value};
use std::fmt;

struct Strict(Value);
impl<'de> Deserialize<'de> for Strict {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        struct Read;
        impl<'de> Visitor<'de> for Read {
            type Value = Strict;
            fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str("bounded JSON")
            }
            fn visit_bool<E: de::Error>(self, v: bool) -> Result<Strict, E> {
                Ok(Strict(Value::Bool(v)))
            }
            fn visit_unit<E: de::Error>(self) -> Result<Strict, E> {
                Ok(Strict(Value::Null))
            }
            fn visit_str<E: de::Error>(self, v: &str) -> Result<Strict, E> {
                Ok(Strict(Value::String(v.into())))
            }
            fn visit_string<E: de::Error>(self, v: String) -> Result<Strict, E> {
                Ok(Strict(Value::String(v)))
            }
            fn visit_i64<E: de::Error>(self, v: i64) -> Result<Strict, E> {
                if v.unsigned_abs() > 9007199254740991 {
                    return Err(E::custom("unsafe number"));
                }
                Ok(Strict(Value::Number(v.into())))
            }
            fn visit_u64<E: de::Error>(self, v: u64) -> Result<Strict, E> {
                if v > 9007199254740991 {
                    return Err(E::custom("unsafe number"));
                }
                Ok(Strict(Value::Number(v.into())))
            }
            fn visit_f64<E: de::Error>(self, v: f64) -> Result<Strict, E> {
                if !v.is_finite() || (v.fract() == 0.0 && v.abs() > 9007199254740991.0) {
                    return Err(E::custom("unsafe number"));
                }
                Number::from_f64(v)
                    .map(|n| Strict(Value::Number(n)))
                    .ok_or_else(|| E::custom("unsafe number"))
            }
            fn visit_seq<A: SeqAccess<'de>>(self, mut sequence: A) -> Result<Strict, A::Error> {
                let mut values = Vec::new();
                while let Some(Strict(v)) = sequence.next_element()? {
                    if values.len() >= 10000 {
                        return Err(de::Error::custom("array limit"));
                    }
                    values.push(v)
                }
                Ok(Strict(Value::Array(values)))
            }
            fn visit_map<A: MapAccess<'de>>(self, mut source: A) -> Result<Strict, A::Error> {
                let mut values = Map::new();
                while let Some(key) = source.next_key::<String>()? {
                    if values.len() >= 10000
                        || values.contains_key(&key)
                        || matches!(key.as_str(), "__proto__" | "prototype" | "constructor")
                    {
                        return Err(de::Error::custom("invalid key"));
                    }
                    let Strict(value) = source.next_value()?;
                    values.insert(key, value);
                }
                Ok(Strict(Value::Object(values)))
            }
        }
        d.deserialize_any(Read)
    }
}
fn bounded(v: &Value, depth: usize, args: bool) -> bool {
    if depth > 32 {
        return false;
    }
    match v {
        Value::Object(m) => {
            m.len() <= if args { 256 } else { 10000 }
                && m.values().all(|v| bounded(v, depth + 1, args))
        }
        Value::Array(a) => {
            a.len() <= if args { 1000 } else { 10000 }
                && a.iter().all(|v| bounded(v, depth + 1, args))
        }
        _ => true,
    }
}
/// Strict parsing checks decoded duplicate keys and numbers before normalization.
pub fn strict_json(bytes: &[u8]) -> Result<Value, &'static str> {
    let mut d = serde_json::Deserializer::from_slice(bytes);
    let Strict(v) = Strict::deserialize(&mut d).map_err(|_| "invalid JSON")?;
    d.end().map_err(|_| "invalid JSON")?;
    if !bounded(&v, 0, false) {
        return Err("JSON limits");
    }
    Ok(v)
}
/// RFC8785 is provided by the pinned independent Rust implementation.
pub fn canonical(v: &Value) -> Result<String, &'static str> {
    serde_json_canonicalizer::to_string(v).map_err(|_| "invalid canonical JSON")
}
pub(super) fn value_profile(v: &Value) -> bool {
    bounded(v, 0, true) && canonical(v).is_ok_and(|s| s.len() <= 65536)
}
pub(super) fn digest(v: &Value) -> Result<String, &'static str> {
    use sha2::{Digest, Sha256};
    Ok(hex::encode(Sha256::digest(canonical(v)?.as_bytes())))
}
