package store

import (
	"context"
	"errors"
	"sort"
	"strings"

	"github.com/local/wwm-companion/services/api/internal/domain"
)

var ErrNotFound = errors.New("not found")

type POIFilter struct {
	RegionID         string
	Categories       []string
	SourceCategories []string
	MissingOnly      bool
	Search           string
	Floor            string
}

type Store interface {
	Name() string
	Regions(context.Context) ([]domain.Region, error)
	POIs(context.Context, POIFilter) ([]domain.POI, error)
	POI(context.Context, string) (domain.POI, error)
	SetCompletion(context.Context, string, domain.CompletionStatus) (domain.POI, error)
	Progress(context.Context, string) (domain.RegionProgress, error)
	Settings(context.Context) (domain.Settings, error)
	PutSettings(context.Context, domain.Settings) (domain.Settings, error)
	CacheGet(context.Context, string) (domain.CacheRecord, bool, error)
	CachePut(context.Context, string, domain.CacheRecord) error
	Export(context.Context) (domain.ProgressExport, error)
	Import(context.Context, domain.ProgressExport) (int, error)
	Close()
}

func FilterPOIs(pois []domain.POI, filter POIFilter) []domain.POI {
	categories := make(map[string]bool, len(filter.Categories))
	for _, category := range filter.Categories {
		categories[strings.ToLower(strings.TrimSpace(category))] = true
	}
	sourceCategories := make(map[string]bool, len(filter.SourceCategories))
	for _, category := range filter.SourceCategories {
		sourceCategories[strings.ToLower(strings.TrimSpace(category))] = true
	}
	needle := strings.ToLower(strings.TrimSpace(filter.Search))
	result := make([]domain.POI, 0, len(pois))
	for _, poi := range pois {
		if filter.RegionID != "" && poi.RegionID != filter.RegionID {
			continue
		}
		if len(categories) > 0 && !categories[poi.Category] {
			continue
		}
		if len(sourceCategories) > 0 && !sourceCategories[strings.ToLower(poi.SourceCategory)] {
			continue
		}
		if filter.MissingOnly && poi.Status == domain.StatusCompleted {
			continue
		}
		if filter.Floor != "" && filter.Floor != "all" && poi.Floor != filter.Floor {
			continue
		}
		if needle != "" {
			haystack := strings.ToLower(strings.Join([]string{poi.Name, poi.ID, poi.SourceCategory, poi.NearestLandmark, poi.Subregion}, " "))
			if !strings.Contains(haystack, needle) {
				continue
			}
		}
		result = append(result, poi)
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].Category == result[j].Category {
			return result[i].Name < result[j].Name
		}
		return result[i].Category < result[j].Category
	})
	return result
}

func CalculateProgress(regionID string, pois []domain.POI) domain.RegionProgress {
	categoryOrder := []string{"chest", "oddity", "puzzle", "quest"}
	categoryCounts := make(map[string]*domain.CategoryProgress, len(categoryOrder))
	for _, category := range categoryOrder {
		categoryCounts[category] = &domain.CategoryProgress{Category: category}
	}
	progress := domain.RegionProgress{RegionID: regionID}
	for _, poi := range pois {
		if poi.RegionID != regionID {
			continue
		}
		progress.Total++
		category, ok := categoryCounts[poi.Category]
		if !ok {
			category = &domain.CategoryProgress{Category: poi.Category}
			categoryCounts[poi.Category] = category
			categoryOrder = append(categoryOrder, poi.Category)
		}
		category.Total++
		if poi.Status == domain.StatusCompleted {
			progress.Completed++
			category.Completed++
		}
	}
	progress.Remaining = progress.Total - progress.Completed
	if progress.Total > 0 {
		progress.Percentage = float64(progress.Completed) / float64(progress.Total) * 100
	}
	for _, category := range categoryOrder {
		item := categoryCounts[category]
		item.Remaining = item.Total - item.Completed
		progress.Categories = append(progress.Categories, *item)
	}
	return progress
}
