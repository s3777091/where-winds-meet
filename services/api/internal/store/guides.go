package store

import (
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"strings"

	"github.com/local/wwm-companion/services/api/internal/domain"
)

type guideCatalog struct {
	SchemaVersion int                     `json:"schema_version"`
	Guides        map[string]guideContent `json:"guides"`
}

type guideContent struct {
	Floor           string                  `json:"floor,omitempty"`
	Entrance        string                  `json:"entrance,omitempty"`
	Requirements    []string                `json:"requirements,omitempty"`
	NavigationSteps []string                `json:"navigation_steps,omitempty"`
	SolutionSteps   []string                `json:"solution_steps,omitempty"`
	CommonMistake   string                  `json:"common_mistake,omitempty"`
	ReferenceImages []domain.ReferenceImage `json:"reference_images,omitempty"`
	Provenance      domain.Provenance       `json:"provenance"`
}

func applyGuideCatalog(seed *seedData, path string) error {
	if strings.TrimSpace(path) == "" {
		return nil
	}
	payload, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read POI guide catalog: %w", err)
	}
	var catalog guideCatalog
	if err := json.Unmarshal(payload, &catalog); err != nil {
		return fmt.Errorf("decode POI guide catalog: %w", err)
	}
	if catalog.SchemaVersion != 1 {
		return fmt.Errorf("unsupported POI guide schema version %d", catalog.SchemaVersion)
	}

	poisByID := make(map[string]*domain.POI, len(seed.POIs))
	for index := range seed.POIs {
		poisByID[seed.POIs[index].ID] = &seed.POIs[index]
	}
	for id, guide := range catalog.Guides {
		poi, ok := poisByID[id]
		if !ok {
			return fmt.Errorf("POI guide references unknown id %q", id)
		}
		if err := validateGuide(id, guide); err != nil {
			return err
		}
		if guide.Floor != "" {
			poi.Floor = guide.Floor
		}
		if guide.Entrance != "" {
			poi.Entrance = guide.Entrance
		}
		if len(guide.Requirements) > 0 {
			poi.Requirements = guide.Requirements
		}
		if len(guide.NavigationSteps) > 0 {
			poi.NavigationSteps = guide.NavigationSteps
		}
		if len(guide.SolutionSteps) > 0 {
			poi.SolutionSteps = guide.SolutionSteps
		}
		if guide.CommonMistake != "" {
			poi.CommonMistake = guide.CommonMistake
		}
		if len(guide.ReferenceImages) > 0 {
			poi.ReferenceImages = guide.ReferenceImages
		}
		provenance := guide.Provenance
		poi.GuideProvenance = &provenance
	}
	return nil
}

func validateGuide(id string, guide guideContent) error {
	if strings.TrimSpace(guide.Provenance.Source) == "" || strings.TrimSpace(guide.Provenance.SourceURL) == "" {
		return fmt.Errorf("POI guide %q is missing source attribution", id)
	}
	if guide.Provenance.VerificationStatus != "verified" && guide.Provenance.VerificationStatus != "source_synced" {
		return fmt.Errorf("POI guide %q must be verified or source-synced before it is published", id)
	}
	if guide.Provenance.VerificationStatus == "source_synced" && guide.Provenance.SourceType != "community_sync" {
		return fmt.Errorf("POI guide %q has an invalid source-synced provenance", id)
	}
	if !isHTTPSURL(guide.Provenance.SourceURL) {
		return fmt.Errorf("POI guide %q has an invalid source URL", id)
	}
	for _, image := range guide.ReferenceImages {
		if !isHTTPSURL(image.URL) || !isHTTPSURL(image.SourceURL) || strings.TrimSpace(image.Alt) == "" {
			return fmt.Errorf("POI guide %q contains an invalid reference image", id)
		}
	}
	return nil
}

func isHTTPSURL(value string) bool {
	parsed, err := url.ParseRequestURI(strings.TrimSpace(value))
	return err == nil && parsed.Scheme == "https" && parsed.Host != ""
}
