package core

import "time"

type Actor struct {
	Principal string   `json:"principal_ref"`
	Workspace string   `json:"workspace_ref"`
	Revision  string   `json:"authorization_revision"`
	Allowed   []string `json:"allowed_tool_ids"`
}
type Tool struct {
	ID          string         `json:"tool_id"`
	Name        string         `json:"name"`
	Title       string         `json:"title"`
	Description string         `json:"description"`
	Aliases     []string       `json:"aliases"`
	Tags        []string       `json:"tags"`
	Effect      string         `json:"effect"`
	OpenWorld   bool           `json:"open_world"`
	Input       map[string]any `json:"input_schema"`
	Output      map[string]any `json:"output_schema,omitempty"`
	Profile     string         `json:"schema_profile"`
}
type Upload struct {
	Profile string `json:"schema_profile"`
	Tools   []Tool `json:"tools"`
}
type Catalog struct {
	ID      string `json:"catalog_id"`
	Version string `json:"catalog_version"`
	Count   int    `json:"tool_count"`
	Profile string `json:"schema_profile"`
	Created string `json:"created_at"`
	Tools   []Tool `json:"tools,omitempty"`
}
type Request struct {
	ExposureLimit int            `json:"exposure_limit,omitempty"`
	Actor         Actor          `json:"actor"`
	CatalogID     string         `json:"catalog_id,omitempty"`
	Version       string         `json:"catalog_version,omitempty"`
	Intent        string         `json:"intent,omitempty"`
	Context       string         `json:"context_summary,omitempty"`
	Locale        string         `json:"locale,omitempty"`
	Known         map[string]any `json:"known_arguments,omitempty"`
	Arguments     map[string]any `json:"arguments,omitempty"`
	Expected      int64          `json:"expected_revision,omitempty"`
	Choice        string         `json:"tool_choice,omitempty"`
	DecisionID    string         `json:"decision_id,omitempty"`
	Outcome       string         `json:"outcome,omitempty"`
	Duration      int64          `json:"duration_ms,omitempty"`
	ErrorCode     string         `json:"error_code,omitempty"`
}
type Selected struct {
	ID          string         `json:"tool_id"`
	Name        string         `json:"name"`
	Title       string         `json:"title"`
	Description string         `json:"description"`
	Effect      string         `json:"effect"`
	OpenWorld   bool           `json:"open_world"`
	Input       map[string]any `json:"input_schema"`
	Digest      string         `json:"schema_digest"`
}
type Candidate struct {
	ID          string `json:"tool_id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Effect      string `json:"effect"`
}
type Decision struct {
	ID              string `json:"decision_id"`
	OperationID     string `json:"operation_id"`
	Revision        int64  `json:"operation_revision"`
	CatalogID       string `json:"catalog_id"`
	Version         string `json:"catalog_version"`
	ToolID          string `json:"tool_id"`
	SchemaDigest    string `json:"schema_digest"`
	ArgumentsDigest string `json:"arguments_digest"`
	Effect          string `json:"effect"`
	ExecutionKey    string `json:"execution_key"`
	Issued          string `json:"issued_at"`
	NotAfter        string `json:"not_after"`
}
type View struct {
	ID         string      `json:"operation_id"`
	Revision   int64       `json:"revision"`
	CatalogID  string      `json:"catalog_id"`
	Version    string      `json:"catalog_version"`
	Expires    string      `json:"expires_at"`
	Status     string      `json:"status"`
	Selected   *Selected   `json:"selected_tool,omitempty"`
	Digest     string      `json:"arguments_digest,omitempty"`
	Next       string      `json:"next_tool,omitempty"`
	Issues     *[]Issue    `json:"issues,omitempty"`
	Missing    *[]string   `json:"missing_paths,omitempty"`
	Candidates []Candidate `json:"candidates,omitempty"`
	Reason     string      `json:"reason,omitempty"`
	Message    string      `json:"message_key,omitempty"`
	Decision   *Decision   `json:"decision,omitempty"`
}
type Binding struct {
	Scope    string
	Scopes   []string
	External bool
}
type Stored struct {
	View    View
	Actor   Actor
	Expires time.Time
}
type Failure struct {
	Status int
	Code   string
	Retry  bool
}

func (f *Failure) Error() string            { return f.Code }
func fail(status int, code string) *Failure { return &Failure{status, code, false} }
func contains(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}
func selected(t Tool) (*Selected, error) {
	d, e := digest(t.Input)
	return &Selected{t.ID, t.Name, t.Title, t.Description, t.Effect, t.OpenWorld, t.Input, d}, e
}
func short(s string) string {
	r := []rune(s)
	if len(r) > 768 {
		return string(r[:768])
	}
	return s
}
