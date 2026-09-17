package store

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/local/wwm-companion/services/api/internal/domain"
)

const (
	officialAPIBase = "https://s2.easebar.com/39f12eda6b86452b"
	officialMapURL  = "https://www.wherewindsmeetgame.com/map/"
)

type officialMapConfig struct {
	ID          int
	Name        string
	MapName     string
	Center      [2]float64
	MinZoom     float64
	MaxZoom     float64
	InitialZoom float64
}

var officialMaps = []officialMapConfig{
	{ID: 1, Name: "Qinghe", MapName: "qinghe", Center: [2]float64{-0.8166, 1.49071}, MinZoom: 8, MaxZoom: 13, InitialZoom: 11},
	{ID: 2, Name: "Kaifeng", MapName: "kaifeng", Center: [2]float64{-1.22119, 1.49886}, MinZoom: 8, MaxZoom: 13, InitialZoom: 11},
	{ID: 3, Name: "Hexi", MapName: "hexiqian", Center: [2]float64{-1.82411, 1.85605}, MinZoom: 8, MaxZoom: 12, InitialZoom: 11},
	{ID: 4, Name: "Kaifeng Imperial Palace", MapName: "kaifenghuanggong", Center: [2]float64{-1.41034, 0.64615}, MinZoom: 1, MaxZoom: 12, InitialZoom: 11},
	{ID: 5, Name: "Hidden Mountain", MapName: "bujianshan", Center: [2]float64{-1.9784, 1.12669}, MinZoom: 8, MaxZoom: 13, InitialZoom: 9.96},
}

type officialPointsResponse struct {
	Success bool `json:"success"`
	Data    struct {
		Categories []struct {
			ChildCategories []struct {
				ID        int    `json:"id"`
				Name      string `json:"name"`
				PointList []struct {
					ID         int    `json:"id"`
					Name       string `json:"name"`
					Lat        string `json:"lat"`
					Lng        string `json:"lng"`
					CategoryID int    `json:"categoryId"`
				} `json:"pointList"`
			} `json:"childCategories"`
		} `json:"categories"`
	} `json:"data"`
}

type officialCache struct {
	FetchedAt time.Time `json:"fetched_at"`
	Seed      seedData  `json:"seed"`
}

func NewOfficialFileStore(ctx context.Context, statePath, cachePath, guidePath string, defaults domain.Settings) (*FileStore, error) {
	client := &http.Client{Timeout: 60 * time.Second}
	seed, err := loadOfficialSeed(ctx, client, cachePath)
	if err != nil {
		return nil, err
	}
	if err := applyGuideCatalog(&seed, guidePath); err != nil {
		return nil, err
	}
	return newFileStore(statePath, seed, defaults, "official-cache")
}

func loadOfficialSeed(ctx context.Context, client *http.Client, cachePath string) (seedData, error) {
	seed, fetchErr := fetchOfficialSeed(ctx, client)
	if fetchErr == nil {
		if err := writeOfficialCache(cachePath, seed); err != nil {
			return seedData{}, err
		}
		return seed, nil
	}

	payload, readErr := os.ReadFile(cachePath)
	if readErr != nil {
		return seedData{}, fmt.Errorf("official map unavailable and no local cache exists: %w", fetchErr)
	}
	var cached officialCache
	if err := json.Unmarshal(payload, &cached); err != nil {
		return seedData{}, fmt.Errorf("decode official map cache: %w", err)
	}
	if len(cached.Seed.Regions) == 0 || len(cached.Seed.POIs) == 0 {
		return seedData{}, fmt.Errorf("official map cache is empty")
	}
	applyLocalTileURLs(&cached.Seed)
	return cached.Seed, nil
}

func applyLocalTileURLs(seed *seedData) {
	mapNames := make(map[string]string, len(officialMaps))
	for _, item := range officialMaps {
		mapNames[officialRegionID(item.ID)] = item.MapName
	}
	for index := range seed.Regions {
		if mapName, ok := mapNames[seed.Regions[index].ID]; ok {
			seed.Regions[index].TileURL = fmt.Sprintf("/api/v1/map-tiles/%s/en/{z}/{y}_{x}.jpg", mapName)
			seed.Regions[index].Attribution = "Bản đồ Where Winds Meet chính thức của NetEase"
		}
	}
}

func fetchOfficialSeed(ctx context.Context, client *http.Client) (seedData, error) {
	seed := seedData{Regions: make([]domain.Region, 0, len(officialMaps))}
	for _, item := range officialMaps {
		seed.Regions = append(seed.Regions, domain.Region{
			ID:          officialRegionID(item.ID),
			Name:        item.Name,
			Fixture:     false,
			Center:      item.Center,
			Bounds:      [2][2]float64{{-2.8, 0}, {0, 2.8}},
			TileURL:     fmt.Sprintf("/api/v1/map-tiles/%s/en/{z}/{y}_{x}.jpg", item.MapName),
			MinZoom:     item.MinZoom,
			MaxZoom:     item.MaxZoom,
			InitialZoom: item.InitialZoom,
			Attribution: "Bản đồ Where Winds Meet chính thức của NetEase",
		})
	}

	type mapResult struct {
		index int
		pois  []domain.POI
		err   error
	}
	results := make(chan mapResult, len(officialMaps))
	var wait sync.WaitGroup
	for index, item := range officialMaps {
		wait.Add(1)
		go func(index int, item officialMapConfig) {
			defer wait.Done()
			pois, err := fetchOfficialMapPoints(ctx, client, item)
			results <- mapResult{index: index, pois: pois, err: err}
		}(index, item)
	}
	wait.Wait()
	close(results)

	ordered := make([][]domain.POI, len(officialMaps))
	for item := range results {
		if item.err != nil {
			return seedData{}, item.err
		}
		ordered[item.index] = item.pois
	}
	for _, pois := range ordered {
		seed.POIs = append(seed.POIs, pois...)
	}
	if len(seed.POIs) == 0 {
		return seedData{}, fmt.Errorf("official map returned no POIs")
	}
	return seed, nil
}

func fetchOfficialMapPoints(ctx context.Context, client *http.Client, mapConfig officialMapConfig) ([]domain.POI, error) {
	endpoint := fmt.Sprintf("%s/api/map/points?mapId=%d&lang=en-US", officialAPIBase, mapConfig.ID)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Accept-Language", "en-US")
	request.Header.Set("Referer", officialMapURL)
	response, err := client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("fetch official map %s: %w", mapConfig.Name, err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("official map %s returned status %d", mapConfig.Name, response.StatusCode)
	}
	payload, err := io.ReadAll(io.LimitReader(response.Body, 32<<20))
	if err != nil {
		return nil, err
	}
	var result officialPointsResponse
	if err := json.Unmarshal(payload, &result); err != nil {
		return nil, fmt.Errorf("decode official map %s: %w", mapConfig.Name, err)
	}
	if !result.Success {
		return nil, fmt.Errorf("official map %s reported failure", mapConfig.Name)
	}

	verified := time.Now().UTC().Format(time.DateOnly)
	var pois []domain.POI
	for _, group := range result.Data.Categories {
		for _, category := range group.ChildCategories {
			for _, point := range category.PointList {
				lat, latErr := parseOfficialCoordinate(point.Lat)
				lng, lngErr := parseOfficialCoordinate(point.Lng)
				if latErr != nil || lngErr != nil {
					continue
				}
				name := strings.TrimSpace(point.Name)
				if name == "" {
					name = category.Name
				}
				pois = append(pois, domain.POI{
					ID:              fmt.Sprintf("OFFICIAL_%d_%d", mapConfig.ID, point.ID),
					Name:            name,
					Category:        broadCategory(category.ID),
					SourceCategory:  category.Name,
					RegionID:        officialRegionID(mapConfig.ID),
					Subregion:       category.Name,
					Coordinates:     [2]float64{lng, lat},
					Floor:           "Surface",
					Entrance:        "Bản đồ chính thức không cung cấp ghi chú lối vào.",
					NearestLandmark: category.Name,
					Requirements:    []string{},
					NavigationSteps: []string{},
					SolutionSteps:   []string{},
					Status:          domain.StatusNotCompleted,
					Provenance: domain.Provenance{
						Source:             "Where Winds Meet Official Interactive Map",
						SourceURL:          officialMapURL,
						SourceType:         "official",
						VerificationStatus: "verified",
						PatchVersion:       "live-official-map",
						LastVerifiedDate:   verified,
					},
				})
			}
		}
	}
	return pois, nil
}

func parseOfficialCoordinate(value string) (float64, error) {
	parsed, err := strconv.ParseInt(strings.TrimSpace(value), 8, 64)
	if err != nil {
		return 0, err
	}
	return float64(parsed) / 100000, nil
}

func broadCategory(categoryID int) string {
	switch categoryID {
	case 11:
		return "chest"
	case 12, 28:
		return "oddity"
	case 5, 8, 14, 29:
		return "quest"
	default:
		return "puzzle"
	}
}

func officialRegionID(mapID int) string {
	return fmt.Sprintf("OFFICIAL_%d", mapID)
}

func writeOfficialCache(path string, seed seedData) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create official cache directory: %w", err)
	}
	payload, err := json.Marshal(officialCache{FetchedAt: time.Now().UTC(), Seed: seed})
	if err != nil {
		return fmt.Errorf("encode official map cache: %w", err)
	}
	tempPath := path + ".tmp"
	if err := os.WriteFile(tempPath, payload, 0o600); err != nil {
		return fmt.Errorf("write official map cache: %w", err)
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("replace official map cache: %w", err)
	}
	if err := os.Rename(tempPath, path); err != nil {
		return fmt.Errorf("commit official map cache: %w", err)
	}
	return nil
}
