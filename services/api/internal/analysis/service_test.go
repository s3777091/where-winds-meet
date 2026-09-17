package analysis

import "testing"

func TestParseProviderResultAcceptsNumericString(t *testing.T) {
	result, err := parseProviderResult(`{"poi_id":"OFFICIAL_1_1","status":"COMPLETED","confidence":"0.91","evidence":["reward shown"]}`)
	if err != nil {
		t.Fatalf("parse provider result: %v", err)
	}
	if result.Confidence != 0.91 || result.Status != "completed" || len(result.Evidence) != 1 {
		t.Fatalf("unexpected result: %#v", result)
	}
}

func TestParseProviderResultAcceptsPercentageAndSingleEvidence(t *testing.T) {
	result, err := parseProviderResult("```json\n{\"status\":\"uncertain\",\"confidence\":\"72%\",\"evidence\":\"target identity is unclear\"}\n```")
	if err != nil {
		t.Fatalf("parse provider result: %v", err)
	}
	if result.Confidence != 0.72 || len(result.Evidence) != 1 {
		t.Fatalf("unexpected result: %#v", result)
	}
}

func TestParseProviderResultRejectsNonNumericConfidence(t *testing.T) {
	if _, err := parseProviderResult(`{"status":"uncertain","confidence":"high","evidence":[]}`); err == nil {
		t.Fatal("expected non-numeric confidence to fail")
	}
}
