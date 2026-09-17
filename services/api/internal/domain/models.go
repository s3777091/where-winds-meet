package domain

import "time"

type CompletionStatus string

const (
	StatusCompleted    CompletionStatus = "completed"
	StatusNotCompleted CompletionStatus = "not_completed"
	StatusUncertain    CompletionStatus = "uncertain"
)

type Provenance struct {
	Source             string `json:"source"`
	SourceURL          string `json:"source_url,omitempty"`
	SourceType         string `json:"source_type"`
	VerificationStatus string `json:"verification_status"`
	PatchVersion       string `json:"patch_version"`
	LastVerifiedDate   string `json:"last_verified_date,omitempty"`
}

type ReferenceImage struct {
	URL       string `json:"url"`
	Alt       string `json:"alt"`
	Caption   string `json:"caption,omitempty"`
	SourceURL string `json:"source_url"`
}

type Region struct {
	ID          string        `json:"id"`
	Name        string        `json:"name"`
	Fixture     bool          `json:"fixture"`
	Center      [2]float64    `json:"center"`
	Bounds      [2][2]float64 `json:"bounds"`
	TileURL     string        `json:"tile_url,omitempty"`
	MinZoom     float64       `json:"min_zoom,omitempty"`
	MaxZoom     float64       `json:"max_zoom,omitempty"`
	InitialZoom float64       `json:"initial_zoom,omitempty"`
	Attribution string        `json:"attribution,omitempty"`
}

type POI struct {
	ID                  string           `json:"id"`
	Name                string           `json:"name"`
	Category            string           `json:"category"`
	RegionID            string           `json:"region_id"`
	Subregion           string           `json:"subregion"`
	Coordinates         [2]float64       `json:"coordinates"`
	Floor               string           `json:"floor"`
	Entrance            string           `json:"entrance"`
	EntranceCoordinates *[2]float64      `json:"entrance_coordinates,omitempty"`
	NearestLandmark     string           `json:"nearest_landmark"`
	Requirements        []string         `json:"requirements"`
	NavigationSteps     []string         `json:"navigation_steps"`
	SolutionSteps       []string         `json:"solution_steps"`
	CommonMistake       string           `json:"common_mistake"`
	ReferenceImages     []ReferenceImage `json:"reference_images"`
	GuideProvenance     *Provenance      `json:"guide_provenance,omitempty"`
	Status              CompletionStatus `json:"status"`
	SourceCategory      string           `json:"source_category,omitempty"`
	Provenance          Provenance       `json:"provenance"`
}

type CategoryProgress struct {
	Category  string `json:"category"`
	Total     int    `json:"total"`
	Completed int    `json:"completed"`
	Remaining int    `json:"remaining"`
}

type RegionProgress struct {
	RegionID   string             `json:"region_id"`
	Total      int                `json:"total"`
	Completed  int                `json:"completed"`
	Remaining  int                `json:"remaining"`
	Percentage float64            `json:"percentage"`
	Categories []CategoryProgress `json:"categories"`
}

type Settings struct {
	Language  string `json:"language"`
	AIModel   string `json:"ai_model"`
	GamePatch string `json:"game_patch"`
	KBVersion string `json:"kb_version"`
}

type AnalysisResult struct {
	AnalysisID string           `json:"analysis_id"`
	POIID      string           `json:"poi_id"`
	Status     CompletionStatus `json:"status"`
	Confidence float64          `json:"confidence"`
	Evidence   []string         `json:"evidence"`
	Cached     bool             `json:"cached"`
	Provider   string           `json:"provider"`
}

type CacheRecord struct {
	Result    AnalysisResult `json:"result"`
	CreatedAt time.Time      `json:"created_at"`
}

type RouteStop struct {
	Order   int     `json:"order"`
	POI     POI     `json:"poi"`
	LegCost float64 `json:"leg_cost"`
}

type RouteGeometry struct {
	Type        string       `json:"type"`
	Coordinates [][2]float64 `json:"coordinates"`
}

type RouteResult struct {
	Stops     []RouteStop   `json:"stops"`
	TotalCost float64       `json:"total_cost"`
	Geometry  RouteGeometry `json:"geometry"`
}

type ProgressExport struct {
	SchemaVersion int                         `json:"schema_version"`
	ExportedAt    time.Time                   `json:"exported_at"`
	Progress      map[string]CompletionStatus `json:"progress"`
	Settings      Settings                    `json:"settings"`
}
