package store

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/local/wwm-companion/services/api/internal/domain"
)

func TestFileStorePersistsCompletion(t *testing.T) {
	directory := t.TempDir()
	seedPath := filepath.Join(directory, "seed.json")
	statePath := filepath.Join(directory, "state.json")
	seed := `{
		"regions":[{"id":"DEV","name":"Dev","fixture":true,"center":[0,0],"bounds":[[-1,-1],[1,1]]}],
		"pois":[{"id":"DEV_POI","name":"Dev POI","category":"chest","region_id":"DEV","subregion":"Dev","coordinates":[0,0],"floor":"Surface","entrance":"Dev","nearest_landmark":"Dev","requirements":[],"navigation_steps":[],"solution_steps":[],"common_mistake":"","status":"not_completed","provenance":{"source":"test","source_type":"dev_fixture","verification_status":"fixture","patch_version":"dev"}}]
	}`
	if err := os.WriteFile(seedPath, []byte(seed), 0o600); err != nil {
		t.Fatal(err)
	}
	settings := domain.Settings{AIModel: "test", GamePatch: "dev", KBVersion: "dev"}
	first, err := NewFileStore(statePath, seedPath, settings)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := first.SetCompletion(context.Background(), "DEV_POI", domain.StatusCompleted); err != nil {
		t.Fatal(err)
	}
	second, err := NewFileStore(statePath, seedPath, settings)
	if err != nil {
		t.Fatal(err)
	}
	poi, err := second.POI(context.Background(), "DEV_POI")
	if err != nil {
		t.Fatal(err)
	}
	if poi.Status != domain.StatusCompleted {
		t.Fatalf("expected persisted completion, got %s", poi.Status)
	}
}

func TestFilterPOIsSupportsOfficialCategoryAndNameSearch(t *testing.T) {
	pois := []domain.POI{
		{ID: "OFFICIAL_1_39", Name: "Beneath the General's Shrine", Category: "puzzle", RegionID: "OFFICIAL_1", SourceCategory: "Boundary Stone"},
		{ID: "OFFICIAL_1_40", Name: "Treasure Chest", Category: "chest", RegionID: "OFFICIAL_1", SourceCategory: "Treasure Chest"},
	}

	filtered := FilterPOIs(pois, POIFilter{RegionID: "OFFICIAL_1", SourceCategories: []string{"Boundary Stone"}})
	if len(filtered) != 1 || filtered[0].ID != "OFFICIAL_1_39" {
		t.Fatalf("expected the official Boundary Stone location, got %#v", filtered)
	}

	searched := FilterPOIs(pois, POIFilter{Search: "beneath the general's shrine"})
	if len(searched) != 1 || searched[0].ID != "OFFICIAL_1_39" {
		t.Fatalf("expected the exact official POI name to be searchable, got %#v", searched)
	}
}
