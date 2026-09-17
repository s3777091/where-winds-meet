package store

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/local/wwm-companion/services/api/internal/domain"
)

type PostgresStore struct {
	pool *pgxpool.Pool
}

func NewPostgresStore(ctx context.Context, databaseURL string) (*PostgresStore, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("configure postgres: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("connect postgres: %w", err)
	}
	return &PostgresStore{pool: pool}, nil
}

func (s *PostgresStore) Name() string { return "postgres" }
func (s *PostgresStore) Close()       { s.pool.Close() }

func (s *PostgresStore) Regions(ctx context.Context) ([]domain.Region, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, name, fixture,
		       ST_X(ST_PointOnSurface(geometry)), ST_Y(ST_PointOnSurface(geometry)),
		       ST_XMin(Box2D(geometry)), ST_YMin(Box2D(geometry)),
		       ST_XMax(Box2D(geometry)), ST_YMax(Box2D(geometry))
		FROM regions ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("query regions: %w", err)
	}
	defer rows.Close()
	var regions []domain.Region
	for rows.Next() {
		var region domain.Region
		if err := rows.Scan(
			&region.ID,
			&region.Name,
			&region.Fixture,
			&region.Center[0],
			&region.Center[1],
			&region.Bounds[0][0],
			&region.Bounds[0][1],
			&region.Bounds[1][0],
			&region.Bounds[1][1],
		); err != nil {
			return nil, fmt.Errorf("scan region: %w", err)
		}
		regions = append(regions, region)
	}
	return regions, rows.Err()
}

type scanner interface {
	Scan(...any) error
}

func scanPOI(row scanner) (domain.POI, error) {
	var poi domain.POI
	var entranceLng, entranceLat pgtype.Float8
	var requirementsJSON, navigationJSON, solutionJSON, provenanceJSON []byte
	if err := row.Scan(
		&poi.ID,
		&poi.Name,
		&poi.Category,
		&poi.RegionID,
		&poi.Subregion,
		&poi.Coordinates[0],
		&poi.Coordinates[1],
		&poi.Floor,
		&poi.Entrance,
		&entranceLng,
		&entranceLat,
		&poi.NearestLandmark,
		&requirementsJSON,
		&navigationJSON,
		&solutionJSON,
		&poi.CommonMistake,
		&poi.Status,
		&provenanceJSON,
	); err != nil {
		return domain.POI{}, err
	}
	if entranceLng.Valid && entranceLat.Valid {
		coordinates := [2]float64{entranceLng.Float64, entranceLat.Float64}
		poi.EntranceCoordinates = &coordinates
	}
	if err := json.Unmarshal(requirementsJSON, &poi.Requirements); err != nil {
		return domain.POI{}, fmt.Errorf("decode POI requirements: %w", err)
	}
	if err := json.Unmarshal(navigationJSON, &poi.NavigationSteps); err != nil {
		return domain.POI{}, fmt.Errorf("decode POI navigation steps: %w", err)
	}
	if err := json.Unmarshal(solutionJSON, &poi.SolutionSteps); err != nil {
		return domain.POI{}, fmt.Errorf("decode POI solution steps: %w", err)
	}
	if err := json.Unmarshal(provenanceJSON, &poi.Provenance); err != nil {
		return domain.POI{}, fmt.Errorf("decode POI provenance: %w", err)
	}
	normalizePOISlices(&poi)
	return poi, nil
}

const poiSelect = `
	SELECT p.id, p.name, p.category, p.region_id, p.subregion,
	       ST_X(p.location), ST_Y(p.location), p.floor, p.entrance,
	       ST_X(p.entrance_location), ST_Y(p.entrance_location),
	       p.nearest_landmark, p.requirements, p.navigation_steps, p.solution_steps,
	       p.common_mistake, COALESCE(pp.status, 'not_completed'), p.provenance
	FROM pois p
	LEFT JOIN player_progress pp ON pp.poi_id = p.id`

func (s *PostgresStore) loadAllPOIs(ctx context.Context) ([]domain.POI, error) {
	rows, err := s.pool.Query(ctx, poiSelect+" ORDER BY p.id")
	if err != nil {
		return nil, fmt.Errorf("query POIs: %w", err)
	}
	defer rows.Close()
	var pois []domain.POI
	for rows.Next() {
		poi, scanErr := scanPOI(rows)
		if scanErr != nil {
			return nil, fmt.Errorf("scan POI: %w", scanErr)
		}
		pois = append(pois, poi)
	}
	return pois, rows.Err()
}

func (s *PostgresStore) POIs(ctx context.Context, filter POIFilter) ([]domain.POI, error) {
	pois, err := s.loadAllPOIs(ctx)
	if err != nil {
		return nil, err
	}
	return FilterPOIs(pois, filter), nil
}

func (s *PostgresStore) POI(ctx context.Context, id string) (domain.POI, error) {
	poi, err := scanPOI(s.pool.QueryRow(ctx, poiSelect+" WHERE p.id = $1", id))
	if err != nil {
		if err == pgx.ErrNoRows {
			return domain.POI{}, ErrNotFound
		}
		return domain.POI{}, fmt.Errorf("query POI: %w", err)
	}
	return poi, nil
}

func (s *PostgresStore) SetCompletion(ctx context.Context, id string, status domain.CompletionStatus) (domain.POI, error) {
	if _, err := s.POI(ctx, id); err != nil {
		return domain.POI{}, err
	}
	_, err := s.pool.Exec(ctx, `
		INSERT INTO player_progress (poi_id, status, updated_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (poi_id) DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()`, id, status)
	if err != nil {
		return domain.POI{}, fmt.Errorf("save completion: %w", err)
	}
	return s.POI(ctx, id)
}

func (s *PostgresStore) Progress(ctx context.Context, regionID string) (domain.RegionProgress, error) {
	pois, err := s.loadAllPOIs(ctx)
	if err != nil {
		return domain.RegionProgress{}, err
	}
	return CalculateProgress(regionID, pois), nil
}

func (s *PostgresStore) Settings(ctx context.Context) (domain.Settings, error) {
	var payload []byte
	err := s.pool.QueryRow(ctx, "SELECT value FROM settings WHERE key = 'global'").Scan(&payload)
	if err != nil {
		if err == pgx.ErrNoRows {
			return domain.Settings{}, ErrNotFound
		}
		return domain.Settings{}, fmt.Errorf("query settings: %w", err)
	}
	var settings domain.Settings
	if err := json.Unmarshal(payload, &settings); err != nil {
		return domain.Settings{}, fmt.Errorf("decode settings: %w", err)
	}
	return settings, nil
}

func (s *PostgresStore) PutSettings(ctx context.Context, settings domain.Settings) (domain.Settings, error) {
	payload, err := json.Marshal(settings)
	if err != nil {
		return domain.Settings{}, err
	}
	_, err = s.pool.Exec(ctx, `
		INSERT INTO settings (key, value, updated_at) VALUES ('global', $1, NOW())
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, payload)
	if err != nil {
		return domain.Settings{}, fmt.Errorf("save settings: %w", err)
	}
	return settings, nil
}

func (s *PostgresStore) CacheGet(ctx context.Context, key string) (domain.CacheRecord, bool, error) {
	var payload []byte
	var createdAt time.Time
	err := s.pool.QueryRow(ctx, "SELECT result, created_at FROM analysis_cache WHERE cache_key = $1", key).Scan(&payload, &createdAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return domain.CacheRecord{}, false, nil
		}
		return domain.CacheRecord{}, false, fmt.Errorf("query analysis cache: %w", err)
	}
	var result domain.AnalysisResult
	if err := json.Unmarshal(payload, &result); err != nil {
		return domain.CacheRecord{}, false, fmt.Errorf("decode analysis cache: %w", err)
	}
	return domain.CacheRecord{Result: result, CreatedAt: createdAt}, true, nil
}

func (s *PostgresStore) CachePut(ctx context.Context, key string, record domain.CacheRecord) error {
	payload, err := json.Marshal(record.Result)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx, `
		INSERT INTO analysis_cache (cache_key, result, created_at) VALUES ($1, $2, $3)
		ON CONFLICT (cache_key) DO UPDATE SET result = EXCLUDED.result, created_at = EXCLUDED.created_at`, key, payload, record.CreatedAt)
	if err != nil {
		return fmt.Errorf("save analysis cache: %w", err)
	}
	return nil
}

func (s *PostgresStore) Export(ctx context.Context) (domain.ProgressExport, error) {
	rows, err := s.pool.Query(ctx, "SELECT poi_id, status FROM player_progress")
	if err != nil {
		return domain.ProgressExport{}, fmt.Errorf("query progress export: %w", err)
	}
	defer rows.Close()
	progress := map[string]domain.CompletionStatus{}
	for rows.Next() {
		var id string
		var status domain.CompletionStatus
		if err := rows.Scan(&id, &status); err != nil {
			return domain.ProgressExport{}, err
		}
		progress[id] = status
	}
	settings, err := s.Settings(ctx)
	if err != nil && err != ErrNotFound {
		return domain.ProgressExport{}, err
	}
	return domain.ProgressExport{SchemaVersion: 1, ExportedAt: time.Now().UTC(), Progress: progress, Settings: settings}, nil
}

func (s *PostgresStore) Import(ctx context.Context, payload domain.ProgressExport) (int, error) {
	if payload.SchemaVersion != 1 {
		return 0, fmt.Errorf("unsupported progress schema version %d", payload.SchemaVersion)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	imported := 0
	for id, status := range payload.Progress {
		if status != domain.StatusCompleted && status != domain.StatusNotCompleted && status != domain.StatusUncertain {
			continue
		}
		command, execErr := tx.Exec(ctx, `
			INSERT INTO player_progress (poi_id, status, updated_at)
			SELECT id, $2, NOW() FROM pois WHERE id = $1
			ON CONFLICT (poi_id) DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()`, id, status)
		if execErr != nil {
			return 0, execErr
		}
		if command.RowsAffected() > 0 {
			imported++
		}
	}
	if payload.Settings.AIModel != "" {
		settingsJSON, marshalErr := json.Marshal(payload.Settings)
		if marshalErr != nil {
			return 0, marshalErr
		}
		if _, execErr := tx.Exec(ctx, `
			INSERT INTO settings (key, value, updated_at) VALUES ('global', $1, NOW())
			ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, settingsJSON); execErr != nil {
			return 0, execErr
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return imported, nil
}
