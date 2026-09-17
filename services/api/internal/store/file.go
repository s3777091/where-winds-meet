package store

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/local/wwm-companion/services/api/internal/domain"
)

type seedData struct {
	Regions []domain.Region `json:"regions"`
	POIs    []domain.POI    `json:"pois"`
}

type fileState struct {
	SchemaVersion int                                `json:"schema_version"`
	Progress      map[string]domain.CompletionStatus `json:"progress"`
	Settings      domain.Settings                    `json:"settings"`
	Cache         map[string]domain.CacheRecord      `json:"cache"`
}

type FileStore struct {
	mu      sync.RWMutex
	path    string
	name    string
	regions []domain.Region
	pois    []domain.POI
	state   fileState
}

func NewFileStore(path, seedPath string, defaults domain.Settings) (*FileStore, error) {
	seedBytes, err := os.ReadFile(seedPath)
	if err != nil {
		return nil, fmt.Errorf("read seed data: %w", err)
	}
	var seed seedData
	if err := json.Unmarshal(seedBytes, &seed); err != nil {
		return nil, fmt.Errorf("decode seed data: %w", err)
	}
	return newFileStore(path, seed, defaults, "fixture-file")
}

func newFileStore(path string, seed seedData, defaults domain.Settings, sourceName string) (*FileStore, error) {
	for index := range seed.POIs {
		normalizePOISlices(&seed.POIs[index])
	}
	result := &FileStore{
		path:    path,
		name:    sourceName,
		regions: seed.Regions,
		pois:    seed.POIs,
		state: fileState{
			SchemaVersion: 1,
			Progress:      map[string]domain.CompletionStatus{},
			Settings:      defaults,
			Cache:         map[string]domain.CacheRecord{},
		},
	}
	if stateBytes, readErr := os.ReadFile(path); readErr == nil {
		if err := json.Unmarshal(stateBytes, &result.state); err != nil {
			return nil, fmt.Errorf("decode player state: %w", err)
		}
	} else if !os.IsNotExist(readErr) {
		return nil, fmt.Errorf("read player state: %w", readErr)
	}
	if result.state.Progress == nil {
		result.state.Progress = map[string]domain.CompletionStatus{}
	}
	if result.state.Cache == nil {
		result.state.Cache = map[string]domain.CacheRecord{}
	}
	if result.state.Settings.AIModel == "" {
		result.state.Settings = defaults
	}
	return result, nil
}

func normalizePOISlices(poi *domain.POI) {
	if poi.Requirements == nil {
		poi.Requirements = []string{}
	}
	if poi.NavigationSteps == nil {
		poi.NavigationSteps = []string{}
	}
	if poi.SolutionSteps == nil {
		poi.SolutionSteps = []string{}
	}
	if poi.ReferenceImages == nil {
		poi.ReferenceImages = []domain.ReferenceImage{}
	}
}

func (s *FileStore) Name() string { return s.name }
func (s *FileStore) Close()       {}

func (s *FileStore) Regions(context.Context) ([]domain.Region, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return append([]domain.Region(nil), s.regions...), nil
}

func (s *FileStore) materializedPOIs() []domain.POI {
	result := make([]domain.POI, len(s.pois))
	copy(result, s.pois)
	for index := range result {
		status := s.state.Progress[result[index].ID]
		if status == "" {
			status = domain.StatusNotCompleted
		}
		result[index].Status = status
	}
	return result
}

func (s *FileStore) POIs(_ context.Context, filter POIFilter) ([]domain.POI, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return FilterPOIs(s.materializedPOIs(), filter), nil
}

func (s *FileStore) POI(_ context.Context, id string) (domain.POI, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, poi := range s.materializedPOIs() {
		if poi.ID == id {
			return poi, nil
		}
	}
	return domain.POI{}, ErrNotFound
}

func (s *FileStore) SetCompletion(_ context.Context, id string, status domain.CompletionStatus) (domain.POI, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	found := false
	for _, poi := range s.pois {
		if poi.ID == id {
			found = true
			break
		}
	}
	if !found {
		return domain.POI{}, ErrNotFound
	}
	s.state.Progress[id] = status
	if err := s.saveLocked(); err != nil {
		return domain.POI{}, err
	}
	for _, poi := range s.materializedPOIs() {
		if poi.ID == id {
			return poi, nil
		}
	}
	return domain.POI{}, ErrNotFound
}

func (s *FileStore) Progress(_ context.Context, regionID string) (domain.RegionProgress, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return CalculateProgress(regionID, s.materializedPOIs()), nil
}

func (s *FileStore) Settings(context.Context) (domain.Settings, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.state.Settings, nil
}

func (s *FileStore) PutSettings(_ context.Context, settings domain.Settings) (domain.Settings, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.state.Settings = settings
	return settings, s.saveLocked()
}

func (s *FileStore) CacheGet(_ context.Context, key string) (domain.CacheRecord, bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	record, ok := s.state.Cache[key]
	return record, ok, nil
}

func (s *FileStore) CachePut(_ context.Context, key string, record domain.CacheRecord) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.state.Cache[key] = record
	return s.saveLocked()
}

func (s *FileStore) Export(context.Context) (domain.ProgressExport, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	progress := make(map[string]domain.CompletionStatus, len(s.state.Progress))
	for key, value := range s.state.Progress {
		progress[key] = value
	}
	return domain.ProgressExport{
		SchemaVersion: 1,
		ExportedAt:    time.Now().UTC(),
		Progress:      progress,
		Settings:      s.state.Settings,
	}, nil
}

func (s *FileStore) Import(_ context.Context, payload domain.ProgressExport) (int, error) {
	if payload.SchemaVersion != 1 {
		return 0, fmt.Errorf("unsupported progress schema version %d", payload.SchemaVersion)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	validIDs := make(map[string]bool, len(s.pois))
	for _, poi := range s.pois {
		validIDs[poi.ID] = true
	}
	imported := 0
	for id, status := range payload.Progress {
		if !validIDs[id] || (status != domain.StatusCompleted && status != domain.StatusNotCompleted && status != domain.StatusUncertain) {
			continue
		}
		s.state.Progress[id] = status
		imported++
	}
	if payload.Settings.AIModel != "" {
		s.state.Settings = payload.Settings
	}
	return imported, s.saveLocked()
}

func (s *FileStore) saveLocked() error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return fmt.Errorf("create state directory: %w", err)
	}
	payload, err := json.MarshalIndent(s.state, "", "  ")
	if err != nil {
		return fmt.Errorf("encode player state: %w", err)
	}
	tempPath := s.path + ".tmp"
	if err := os.WriteFile(tempPath, payload, 0o600); err != nil {
		return fmt.Errorf("write temporary player state: %w", err)
	}
	if err := os.Remove(s.path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("replace player state: %w", err)
	}
	if err := os.Rename(tempPath, s.path); err != nil {
		return fmt.Errorf("commit player state: %w", err)
	}
	return nil
}
