package store

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/local/wwm-companion/services/api/internal/domain"
)

func TestApplyGuideCatalogEnrichesKnownPOI(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "guides.json")
	payload := `{
		"schema_version": 1,
		"guides": {
			"OFFICIAL_1_768": {
				"navigation_steps": ["Đi theo đường mòn phía đông."],
				"solution_steps": ["Dùng kỹ năng được yêu cầu rồi mở rương."],
				"reference_images": [{
					"url": "https://images.example.com/chest.jpg",
					"alt": "Vị trí rương cạnh vách đá",
					"source_url": "https://guides.example.com/chest-768"
				}],
				"provenance": {
					"source": "Reviewed guide",
					"source_url": "https://guides.example.com/chest-768",
					"source_type": "licensed",
					"verification_status": "verified",
					"patch_version": "1.0",
					"last_verified_date": "2026-09-17"
				}
			}
		}
	}`
	if err := os.WriteFile(path, []byte(payload), 0o600); err != nil {
		t.Fatal(err)
	}
	seed := seedData{POIs: []domain.POI{{ID: "OFFICIAL_1_768", Name: "Treasure Chest"}}}
	if err := applyGuideCatalog(&seed, path); err != nil {
		t.Fatal(err)
	}
	poi := seed.POIs[0]
	if len(poi.SolutionSteps) != 1 || len(poi.ReferenceImages) != 1 {
		t.Fatalf("expected deterministic guide enrichment, got %#v", poi)
	}
	if poi.GuideProvenance == nil || poi.GuideProvenance.Source != "Reviewed guide" {
		t.Fatalf("expected separate guide provenance, got %#v", poi.GuideProvenance)
	}
}

func TestApplyGuideCatalogRejectsUnverifiedContent(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "guides.json")
	payload := `{
		"schema_version": 1,
		"guides": {
			"OFFICIAL_1_768": {
				"solution_steps": ["Unreviewed"],
				"provenance": {
					"source": "Community post",
					"source_url": "https://example.com/post",
					"source_type": "manual",
					"verification_status": "unverified",
					"patch_version": "unknown"
				}
			}
		}
	}`
	if err := os.WriteFile(path, []byte(payload), 0o600); err != nil {
		t.Fatal(err)
	}
	seed := seedData{POIs: []domain.POI{{ID: "OFFICIAL_1_768"}}}
	if err := applyGuideCatalog(&seed, path); err == nil {
		t.Fatal("expected unverified guide content to be rejected")
	}
}

func TestApplyGuideCatalogAcceptsAttributedSourceSync(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "guides.json")
	payload := `{
		"schema_version": 1,
		"guides": {
			"OFFICIAL_1_768": {
				"solution_steps": ["Source-provided chest direction."],
				"reference_images": [{
					"url": "https://images.example.com/chest.jpg",
					"alt": "Community reference for the chest",
					"source_url": "https://guides.example.com/chests"
				}],
				"provenance": {
					"source": "Community map sync",
					"source_url": "https://guides.example.com/chests",
					"source_type": "community_sync",
					"verification_status": "source_synced",
					"patch_version": "community-2026-09-17"
				}
			}
		}
	}`
	if err := os.WriteFile(path, []byte(payload), 0o600); err != nil {
		t.Fatal(err)
	}
	seed := seedData{POIs: []domain.POI{{ID: "OFFICIAL_1_768"}}}
	if err := applyGuideCatalog(&seed, path); err != nil {
		t.Fatal(err)
	}
	if seed.POIs[0].GuideProvenance == nil || seed.POIs[0].GuideProvenance.VerificationStatus != "source_synced" {
		t.Fatalf("expected source-synced provenance, got %#v", seed.POIs[0].GuideProvenance)
	}
}
