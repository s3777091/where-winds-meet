package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/local/wwm-companion/services/api/internal/analysis"
	"github.com/local/wwm-companion/services/api/internal/domain"
	"github.com/local/wwm-companion/services/api/internal/route"
	"github.com/local/wwm-companion/services/api/internal/store"
)

const version = "0.1.0"

const officialTileBase = "https://www.wherewindsmeetgame.com/pc/zt/20260526175803/data/map"

var officialMapNames = map[string]bool{
	"qinghe": true, "kaifeng": true, "hexiqian": true, "kaifenghuanggong": true, "bujianshan": true,
}

type Config struct {
	WebOrigin string
}

type Server struct {
	config   Config
	store    store.Store
	analysis *analysis.Service
	logger   *slog.Logger
	handler  http.Handler
}

func New(config Config, repository store.Store, analyzer *analysis.Service, logger *slog.Logger) *Server {
	server := &Server{config: config, store: repository, analysis: analyzer, logger: logger}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/health", server.health)
	mux.HandleFunc("GET /api/v1/regions", server.regions)
	mux.HandleFunc("GET /api/v1/map-tiles/{map}/{language}/{zoom}/{tile}", server.mapTile)
	mux.HandleFunc("GET /api/v1/regions/{id}/source-categories", server.sourceCategories)
	mux.HandleFunc("GET /api/v1/regions/{id}/progress", server.regionProgress)
	mux.HandleFunc("GET /api/v1/pois", server.pois)
	mux.HandleFunc("GET /api/v1/pois/{id}", server.poi)
	mux.HandleFunc("POST /api/v1/pois/{id}/complete", server.completePOI)
	mux.HandleFunc("POST /api/v1/pois/{id}/uncomplete", server.uncompletePOI)
	mux.HandleFunc("POST /api/v1/screenshots/analyze", server.analyzeScreenshot)
	mux.HandleFunc("POST /api/v1/routes", server.buildRoute)
	mux.HandleFunc("GET /api/v1/settings", server.getSettings)
	mux.HandleFunc("PUT /api/v1/settings", server.putSettings)
	mux.HandleFunc("GET /api/v1/progress/export", server.exportProgress)
	mux.HandleFunc("POST /api/v1/progress/import", server.importProgress)
	server.handler = server.middleware(mux)
	return server
}

func (s *Server) Handler() http.Handler { return s.handler }

func (s *Server) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		started := time.Now()
		response.Header().Set("X-Content-Type-Options", "nosniff")
		response.Header().Set("Referrer-Policy", "no-referrer")
		response.Header().Set("Cache-Control", "no-store")
		origin := request.Header.Get("Origin")
		if origin != "" && (origin == s.config.WebOrigin || origin == "http://127.0.0.1:3199" || origin == "http://localhost:3199") {
			response.Header().Set("Access-Control-Allow-Origin", origin)
			response.Header().Set("Vary", "Origin")
			response.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			response.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
		}
		if request.Method == http.MethodOptions {
			response.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(response, request)
		s.logger.Info("request", "method", request.Method, "path", request.URL.Path, "duration", time.Since(started).String())
	})
}

func (s *Server) health(response http.ResponseWriter, _ *http.Request) {
	writeJSON(response, http.StatusOK, map[string]string{
		"status":  "ok",
		"storage": s.store.Name(),
		"ai_mode": s.analysis.Mode(),
		"version": version,
	})
}

func (s *Server) regions(response http.ResponseWriter, request *http.Request) {
	regions, err := s.store.Regions(request.Context())
	if err != nil {
		s.fail(response, err)
		return
	}
	writeJSON(response, http.StatusOK, regions)
}

func (s *Server) mapTile(response http.ResponseWriter, request *http.Request) {
	mapName := request.PathValue("map")
	language := request.PathValue("language")
	zoom, zoomErr := strconv.Atoi(request.PathValue("zoom"))
	tileName := request.PathValue("tile")
	tileStem := strings.TrimSuffix(tileName, ".jpg")
	tileParts := strings.Split(tileStem, "_")
	if !officialMapNames[mapName] || language != "en" || zoomErr != nil || zoom < 1 || zoom > 13 ||
		!strings.HasSuffix(tileName, ".jpg") || len(tileParts) != 2 {
		http.NotFound(response, request)
		return
	}
	y, yErr := strconv.Atoi(tileParts[0])
	x, xErr := strconv.Atoi(tileParts[1])
	maxCoordinate := 1 << zoom
	if yErr != nil || xErr != nil || y < 0 || x < 0 || y >= maxCoordinate || x >= maxCoordinate {
		http.NotFound(response, request)
		return
	}

	upstreamURL := fmt.Sprintf("%s/%s/%s/%d/%d_%d.jpg", officialTileBase, mapName, language, zoom, y, x)
	upstreamRequest, err := http.NewRequestWithContext(request.Context(), http.MethodGet, upstreamURL, nil)
	if err != nil {
		s.fail(response, err)
		return
	}
	upstreamRequest.Header.Set("Accept", "image/avif,image/webp,image/jpeg,image/*")
	upstreamRequest.Header.Set("Referer", "https://www.wherewindsmeetgame.com/map/")
	upstreamRequest.Header.Set("User-Agent", "WWM-Companion/0.1")
	upstreamResponse, err := http.DefaultClient.Do(upstreamRequest)
	if err != nil {
		writeError(response, http.StatusBadGateway, "Ô bản đồ chính thức tạm thời không khả dụng.")
		return
	}
	defer upstreamResponse.Body.Close()
	if upstreamResponse.StatusCode == http.StatusNotFound {
		http.NotFound(response, request)
		return
	}
	if upstreamResponse.StatusCode < 200 || upstreamResponse.StatusCode >= 300 {
		writeError(response, http.StatusBadGateway, "Ô bản đồ chính thức tạm thời không khả dụng.")
		return
	}
	response.Header().Set("Content-Type", "image/jpeg")
	response.Header().Set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800")
	response.WriteHeader(http.StatusOK)
	_, _ = io.Copy(response, io.LimitReader(upstreamResponse.Body, 4<<20))
}

func (s *Server) regionProgress(response http.ResponseWriter, request *http.Request) {
	progress, err := s.store.Progress(request.Context(), request.PathValue("id"))
	if err != nil {
		s.fail(response, err)
		return
	}
	writeJSON(response, http.StatusOK, progress)
}

func (s *Server) sourceCategories(response http.ResponseWriter, request *http.Request) {
	pois, err := s.store.POIs(request.Context(), store.POIFilter{RegionID: request.PathValue("id")})
	if err != nil {
		s.fail(response, err)
		return
	}
	counts := make(map[string]int)
	for _, poi := range pois {
		name := strings.TrimSpace(poi.SourceCategory)
		if name != "" {
			counts[name]++
		}
	}
	type summary struct {
		Name  string `json:"name"`
		Total int    `json:"total"`
	}
	items := make([]summary, 0, len(counts))
	for name, total := range counts {
		items = append(items, summary{Name: name, Total: total})
	}
	slices.SortFunc(items, func(a, b summary) int { return strings.Compare(a.Name, b.Name) })
	writeJSON(response, http.StatusOK, items)
}

func (s *Server) pois(response http.ResponseWriter, request *http.Request) {
	query := request.URL.Query()
	var categories []string
	if raw := query.Get("categories"); raw != "" {
		categories = strings.Split(raw, ",")
	}
	var sourceCategories []string
	if raw := query.Get("source_categories"); raw != "" {
		sourceCategories = strings.Split(raw, ",")
	}
	pois, err := s.store.POIs(request.Context(), store.POIFilter{
		RegionID:         query.Get("region_id"),
		Categories:       categories,
		SourceCategories: sourceCategories,
		MissingOnly:      query.Get("missing_only") == "true",
		Search:           query.Get("search"),
		Floor:            query.Get("floor"),
	})
	if err != nil {
		s.fail(response, err)
		return
	}
	writeJSON(response, http.StatusOK, pois)
}

func (s *Server) poi(response http.ResponseWriter, request *http.Request) {
	poi, err := s.store.POI(request.Context(), request.PathValue("id"))
	if err != nil {
		s.fail(response, err)
		return
	}
	writeJSON(response, http.StatusOK, poi)
}

func (s *Server) completePOI(response http.ResponseWriter, request *http.Request) {
	s.setCompletion(response, request, domain.StatusCompleted)
}

func (s *Server) uncompletePOI(response http.ResponseWriter, request *http.Request) {
	s.setCompletion(response, request, domain.StatusNotCompleted)
}

func (s *Server) setCompletion(response http.ResponseWriter, request *http.Request, status domain.CompletionStatus) {
	poi, err := s.store.SetCompletion(request.Context(), request.PathValue("id"), status)
	if err != nil {
		s.fail(response, err)
		return
	}
	writeJSON(response, http.StatusOK, poi)
}

func (s *Server) analyzeScreenshot(response http.ResponseWriter, request *http.Request) {
	request.Body = http.MaxBytesReader(response, request.Body, 13<<20)
	if err := request.ParseMultipartForm(13 << 20); err != nil {
		writeError(response, http.StatusBadRequest, "Ảnh chụp quá lớn hoặc yêu cầu không hợp lệ.")
		return
	}
	poiID := strings.TrimSpace(request.FormValue("poi_id"))
	if poiID == "" {
		writeError(response, http.StatusBadRequest, "Thiếu mã địa điểm poi_id.")
		return
	}
	poi, err := s.store.POI(request.Context(), poiID)
	if err != nil {
		s.fail(response, err)
		return
	}
	file, header, err := request.FormFile("image")
	if err != nil {
		writeError(response, http.StatusBadRequest, "Bạn cần gửi kèm một ảnh.")
		return
	}
	defer file.Close()
	imageBytes, err := io.ReadAll(io.LimitReader(file, 12<<20+1))
	if err != nil || len(imageBytes) == 0 || len(imageBytes) > 12<<20 {
		writeError(response, http.StatusBadRequest, "Ảnh chụp phải nhỏ hơn 12 MB.")
		return
	}
	mediaType := http.DetectContentType(imageBytes[:min(512, len(imageBytes))])
	if mediaType != "image/png" && mediaType != "image/jpeg" && mediaType != "image/webp" {
		writeError(response, http.StatusBadRequest, "Ảnh chụp phải là PNG, JPEG hoặc WebP.")
		return
	}
	result, err := s.analysis.Analyze(
		request.Context(),
		poi,
		imageBytes,
		mediaType,
		header.Filename,
		strings.TrimSpace(request.FormValue("optional_note")),
	)
	if err != nil {
		s.fail(response, err)
		return
	}
	if result.Status == domain.StatusCompleted && result.Confidence >= 0.85 && len(result.Evidence) > 0 {
		if _, err := s.store.SetCompletion(request.Context(), poi.ID, domain.StatusCompleted); err != nil {
			s.fail(response, err)
			return
		}
	}
	writeJSON(response, http.StatusOK, result)
}

func (s *Server) buildRoute(response http.ResponseWriter, request *http.Request) {
	var input struct {
		RegionID         string      `json:"region_id"`
		Start            *[2]float64 `json:"start"`
		Categories       []string    `json:"categories"`
		Floor            string      `json:"floor"`
		Search           string      `json:"search"`
		SourceCategories []string    `json:"source_categories"`
	}
	if err := readJSON(request, &input, 1<<20); err != nil {
		writeError(response, http.StatusBadRequest, err.Error())
		return
	}
	if input.RegionID == "" {
		writeError(response, http.StatusBadRequest, "Thiếu mã khu vực region_id.")
		return
	}
	pois, err := s.store.POIs(request.Context(), store.POIFilter{
		RegionID:         input.RegionID,
		Categories:       input.Categories,
		Floor:            input.Floor,
		Search:           input.Search,
		SourceCategories: input.SourceCategories,
		MissingOnly:      true,
	})
	if err != nil {
		s.fail(response, err)
		return
	}
	start := [2]float64{0, 0}
	if input.Start != nil {
		start = *input.Start
	} else {
		regions, regionErr := s.store.Regions(request.Context())
		if regionErr != nil {
			s.fail(response, regionErr)
			return
		}
		for _, region := range regions {
			if region.ID == input.RegionID {
				start = region.Center
				break
			}
		}
	}
	writeJSON(response, http.StatusOK, route.Build(start, pois))
}

func (s *Server) getSettings(response http.ResponseWriter, request *http.Request) {
	settings, err := s.store.Settings(request.Context())
	if err != nil {
		s.fail(response, err)
		return
	}
	writeJSON(response, http.StatusOK, settings)
}

func (s *Server) putSettings(response http.ResponseWriter, request *http.Request) {
	var settings domain.Settings
	if err := readJSON(request, &settings, 1<<20); err != nil {
		writeError(response, http.StatusBadRequest, err.Error())
		return
	}
	if settings.AIModel == "" || settings.GamePatch == "" || settings.KBVersion == "" {
		writeError(response, http.StatusBadRequest, "Thiếu cấu hình mô hình AI, phiên bản game hoặc cơ sở tri thức.")
		return
	}
	updated, err := s.store.PutSettings(request.Context(), settings)
	if err != nil {
		s.fail(response, err)
		return
	}
	writeJSON(response, http.StatusOK, updated)
}

func (s *Server) exportProgress(response http.ResponseWriter, request *http.Request) {
	payload, err := s.store.Export(request.Context())
	if err != nil {
		s.fail(response, err)
		return
	}
	writeJSON(response, http.StatusOK, payload)
}

func (s *Server) importProgress(response http.ResponseWriter, request *http.Request) {
	var payload domain.ProgressExport
	if err := readJSON(request, &payload, 5<<20); err != nil {
		writeError(response, http.StatusBadRequest, err.Error())
		return
	}
	count, err := s.store.Import(request.Context(), payload)
	if err != nil {
		writeError(response, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(response, http.StatusOK, map[string]int{"imported": count})
}

func (s *Server) fail(response http.ResponseWriter, err error) {
	if errors.Is(err, store.ErrNotFound) {
		writeError(response, http.StatusNotFound, "Không tìm thấy dữ liệu yêu cầu.")
		return
	}
	if errors.Is(err, analysis.ErrProviderUnavailable) {
		s.logger.Error("AI analysis failed", "error", err)
		writeError(response, http.StatusBadGateway, "Mô hình miễn phí đang quá tải và mô hình dự phòng giá rẻ cũng thất bại. Hãy thử lại.")
		return
	}
	s.logger.Error("request failed", "error", err)
	writeError(response, http.StatusInternalServerError, "Dịch vụ cục bộ không thể hoàn tất yêu cầu.")
}

func readJSON(request *http.Request, target any, limit int64) error {
	decoder := json.NewDecoder(io.LimitReader(request.Body, limit))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return fmt.Errorf("invalid JSON request: %w", err)
	}
	return nil
}

func writeJSON(response http.ResponseWriter, status int, payload any) {
	response.Header().Set("Content-Type", "application/json; charset=utf-8")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(payload)
}

func writeError(response http.ResponseWriter, status int, message string) {
	writeJSON(response, status, map[string]string{"error": message})
}

func Shutdown(ctx context.Context, server *http.Server) error {
	return server.Shutdown(ctx)
}
