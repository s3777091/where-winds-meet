package analysis

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/local/wwm-companion/services/api/internal/domain"
	"github.com/local/wwm-companion/services/api/internal/store"
)

const stableInstructions = `You validate evidence for a local Where Winds Meet completion companion.
Determine only whether the selected target POI was completed in the submitted screenshot.
Never infer completion merely because a chest, puzzle, quest, or map is visible.
Completion requires explicit evidence such as an opened target, reward notification, obtained notification, or equivalent target-specific proof.
Return JSON only with: poi_id, status, confidence, evidence.
Allowed status values: completed, not_completed, uncertain.
confidence must be a JSON number from 0 to 1. evidence must be an array of short Vietnamese strings.
Use uncertain whenever evidence is ambiguous or target identity cannot be connected to the screenshot.`

type Config struct {
	Enabled        bool
	APIKey         string
	BaseURL        string
	Model          string
	FallbackModels []string
	Provider       string
	GamePatch      string
	KBVersion      string
	HTTPClient     *http.Client
}

var ErrProviderUnavailable = errors.New("AI provider unavailable")

type Service struct {
	config Config
	store  store.Store
}

func New(config Config, repository store.Store) *Service {
	if config.HTTPClient == nil {
		config.HTTPClient = &http.Client{Timeout: 60 * time.Second}
	}
	return &Service{config: config, store: repository}
}

func (s *Service) Mode() string {
	if s.config.Enabled && s.config.APIKey != "" {
		if s.config.Provider != "" {
			return s.config.Provider
		}
		return "openrouter"
	}
	return "mock"
}

func (s *Service) Analyze(ctx context.Context, poi domain.POI, imageBytes []byte, mediaType, filename, note string) (domain.AnalysisResult, error) {
	hash, err := perceptualHash(imageBytes)
	if err != nil {
		return domain.AnalysisResult{}, fmt.Errorf("decode screenshot: %w", err)
	}
	cacheKey := s.cacheKey(poi.ID, hash)
	if cached, ok, cacheErr := s.store.CacheGet(ctx, cacheKey); cacheErr != nil {
		return domain.AnalysisResult{}, cacheErr
	} else if ok {
		cached.Result.Cached = true
		return cached.Result, nil
	}

	var result domain.AnalysisResult
	if s.Mode() != "mock" {
		optimized, optimizeErr := optimizeImage(imageBytes)
		if optimizeErr != nil {
			return domain.AnalysisResult{}, optimizeErr
		}
		result, err = s.callProvider(ctx, poi, optimized, "image/jpeg", note)
	} else {
		result = mockResult(poi.ID, filename, note)
	}
	if err != nil {
		return domain.AnalysisResult{}, err
	}
	result = validateResult(result, poi.ID)
	if result.AnalysisID == "" {
		result.AnalysisID = newID()
	}
	if result.Provider == "" {
		result.Provider = s.Mode()
	}
	result.Cached = false
	if err := s.store.CachePut(ctx, cacheKey, domain.CacheRecord{Result: result, CreatedAt: time.Now().UTC()}); err != nil {
		return domain.AnalysisResult{}, err
	}
	return result, nil
}

func (s *Service) cacheKey(poiID, perceptualHash string) string {
	models := append([]string{s.config.Model}, s.config.FallbackModels...)
	raw := strings.Join([]string{"screenshot-analysis", poiID, perceptualHash, s.config.Provider, strings.Join(models, ","), s.config.GamePatch, s.config.KBVersion}, ":")
	digest := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(digest[:])
}

func mockResult(poiID, filename, note string) domain.AnalysisResult {
	signal := strings.ToLower(filename + " " + note)
	result := domain.AnalysisResult{
		AnalysisID: newID(),
		POIID:      poiID,
		Status:     domain.StatusUncertain,
		Confidence: 0.2,
		Evidence:   []string{"Visual analysis is not configured, so completion evidence was not inferred."},
		Provider:   "mock",
	}
	if strings.Contains(signal, "dev-confirm-completed") {
		result.Status = domain.StatusCompleted
		result.Confidence = 0.99
		result.Evidence = []string{"Explicit DEV fixture completion signal was supplied."}
	} else if strings.Contains(signal, "dev-confirm-not-completed") {
		result.Status = domain.StatusNotCompleted
		result.Confidence = 0.99
		result.Evidence = []string{"Explicit DEV fixture incomplete signal was supplied."}
	}
	return result
}

func validateResult(result domain.AnalysisResult, poiID string) domain.AnalysisResult {
	result.POIID = poiID
	if result.Confidence < 0 {
		result.Confidence = 0
	}
	if result.Confidence > 1 {
		result.Confidence = 1
	}
	if result.Status != domain.StatusCompleted && result.Status != domain.StatusNotCompleted && result.Status != domain.StatusUncertain {
		result.Status = domain.StatusUncertain
	}
	if result.Evidence == nil {
		result.Evidence = []string{}
	}
	if result.Status == domain.StatusCompleted && (result.Confidence < 0.85 || len(result.Evidence) == 0) {
		result.Status = domain.StatusUncertain
		result.Evidence = append(result.Evidence, "Completion threshold was not met.")
	}
	return result
}

func (s *Service) callProvider(ctx context.Context, poi domain.POI, imageBytes []byte, mediaType, note string) (domain.AnalysisResult, error) {
	poiContext, _ := json.Marshal(map[string]any{
		"poi_id":            poi.ID,
		"type":              poi.Category,
		"name":              poi.Name,
		"floor":             poi.Floor,
		"nearest_landmark":  poi.NearestLandmark,
		"expected_evidence": []string{"target visibly completed", "reward or obtained notification", "equivalent target-specific completion evidence"},
	})
	models := append([]string{s.config.Model}, s.config.FallbackModels...)
	var failures []string
	for _, model := range models {
		model = strings.TrimSpace(model)
		if model == "" {
			continue
		}
		result, err := s.callModel(ctx, model, poiContext, imageBytes, mediaType, note)
		if err == nil {
			return result, nil
		}
		failures = append(failures, model+": "+err.Error())
	}
	return domain.AnalysisResult{}, fmt.Errorf("%w: %s", ErrProviderUnavailable, strings.Join(failures, "; "))
}

func (s *Service) callModel(ctx context.Context, model string, poiContext, imageBytes []byte, mediaType, note string) (domain.AnalysisResult, error) {
	requestBody := map[string]any{
		"model": model,
		"messages": []map[string]any{
			{"role": "system", "content": stableInstructions},
			{
				"role": "user",
				"content": []map[string]any{
					{"type": "image_url", "image_url": map[string]string{"url": "data:" + mediaType + ";base64," + base64.StdEncoding.EncodeToString(imageBytes)}},
					{"type": "text", "text": "Target context: " + string(poiContext) + "\nOptional player note: " + note + "\nDoes this screenshot provide sufficient evidence that the target was completed?"},
				},
			},
		},
		"temperature":       0,
		"max_tokens":        700,
		"include_reasoning": false,
		"response_format":   map[string]string{"type": "json_object"},
	}
	payload, err := json.Marshal(requestBody)
	if err != nil {
		return domain.AnalysisResult{}, err
	}
	endpoint := strings.TrimRight(s.config.BaseURL, "/") + "/chat/completions"
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return domain.AnalysisResult{}, err
	}
	request.Header.Set("Authorization", "Bearer "+s.config.APIKey)
	request.Header.Set("Content-Type", "application/json")
	if strings.EqualFold(s.config.Provider, "openrouter") {
		request.Header.Set("HTTP-Referer", "http://localhost:3199")
		request.Header.Set("X-Title", "Where Winds Meet Smart Companion")
	}
	response, err := s.config.HTTPClient.Do(request)
	if err != nil {
		return domain.AnalysisResult{}, fmt.Errorf("call %s: %w", s.Mode(), err)
	}
	defer response.Body.Close()
	responseBytes, err := io.ReadAll(io.LimitReader(response.Body, 2<<20))
	if err != nil {
		return domain.AnalysisResult{}, err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return domain.AnalysisResult{}, fmt.Errorf("status %d: %s", response.StatusCode, providerError(responseBytes))
	}
	var completion struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(responseBytes, &completion); err != nil || len(completion.Choices) == 0 {
		return domain.AnalysisResult{}, fmt.Errorf("decode %s response", s.Mode())
	}
	content := strings.TrimSpace(completion.Choices[0].Message.Content)
	if content == "" {
		return domain.AnalysisResult{}, fmt.Errorf("empty completion")
	}
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	result, err := parseProviderResult(content)
	if err != nil {
		return domain.AnalysisResult{}, fmt.Errorf("validate %s JSON: %w", s.Mode(), err)
	}
	result.Provider = s.Mode() + ":" + model
	return result, nil
}

func parseProviderResult(content string) (domain.AnalysisResult, error) {
	content = strings.TrimSpace(content)
	if start, end := strings.Index(content, "{"), strings.LastIndex(content, "}"); start >= 0 && end > start {
		content = content[start : end+1]
	}
	var raw struct {
		POIID      string          `json:"poi_id"`
		Status     string          `json:"status"`
		Confidence json.RawMessage `json:"confidence"`
		Evidence   json.RawMessage `json:"evidence"`
	}
	if err := json.Unmarshal([]byte(content), &raw); err != nil {
		return domain.AnalysisResult{}, err
	}
	confidence, err := parseConfidence(raw.Confidence)
	if err != nil {
		return domain.AnalysisResult{}, err
	}
	evidence := []string{}
	if len(raw.Evidence) > 0 && string(raw.Evidence) != "null" {
		if err := json.Unmarshal(raw.Evidence, &evidence); err != nil {
			var single string
			if stringErr := json.Unmarshal(raw.Evidence, &single); stringErr != nil {
				return domain.AnalysisResult{}, fmt.Errorf("evidence must be a string or string array")
			}
			evidence = []string{single}
		}
	}
	return domain.AnalysisResult{
		POIID:      raw.POIID,
		Status:     domain.CompletionStatus(strings.ToLower(strings.TrimSpace(raw.Status))),
		Confidence: confidence,
		Evidence:   evidence,
	}, nil
}

func parseConfidence(raw json.RawMessage) (float64, error) {
	var value float64
	if err := json.Unmarshal(raw, &value); err == nil {
		return value, nil
	}
	var text string
	if err := json.Unmarshal(raw, &text); err != nil {
		return 0, fmt.Errorf("confidence must be numeric")
	}
	value, err := strconv.ParseFloat(strings.TrimSpace(strings.TrimSuffix(text, "%")), 64)
	if err != nil {
		return 0, fmt.Errorf("confidence must be numeric")
	}
	if strings.HasSuffix(strings.TrimSpace(text), "%") {
		value /= 100
	}
	return value, nil
}

func providerError(payload []byte) string {
	var response struct {
		Error struct {
			Message string `json:"message"`
			Code    any    `json:"code"`
		} `json:"error"`
	}
	if json.Unmarshal(payload, &response) == nil && response.Error.Message != "" {
		return fmt.Sprintf("%v %s", response.Error.Code, response.Error.Message)
	}
	return "provider request failed"
}

func perceptualHash(payload []byte) (string, error) {
	imageValue, _, err := image.Decode(bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	bounds := imageValue.Bounds()
	values := make([]uint8, 64)
	var total int
	for y := 0; y < 8; y++ {
		for x := 0; x < 8; x++ {
			sampleX := bounds.Min.X + (x*2+1)*bounds.Dx()/16
			sampleY := bounds.Min.Y + (y*2+1)*bounds.Dy()/16
			gray := color.GrayModel.Convert(imageValue.At(sampleX, sampleY)).(color.Gray).Y
			values[y*8+x] = gray
			total += int(gray)
		}
	}
	average := uint8(total / 64)
	var hash uint64
	for index, value := range values {
		if value >= average {
			hash |= 1 << index
		}
	}
	return fmt.Sprintf("%016x", hash), nil
}

func optimizeImage(payload []byte) ([]byte, error) {
	source, _, err := image.Decode(bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("decode screenshot for optimization: %w", err)
	}
	bounds := source.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	const maxDimension = 1280
	if width > maxDimension || height > maxDimension {
		scale := float64(maxDimension) / float64(max(width, height))
		width = max(1, int(float64(width)*scale))
		height = max(1, int(float64(height)*scale))
	}
	resized := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			sourceX := bounds.Min.X + x*bounds.Dx()/width
			sourceY := bounds.Min.Y + y*bounds.Dy()/height
			resized.Set(x, y, source.At(sourceX, sourceY))
		}
	}
	var output bytes.Buffer
	if err := jpeg.Encode(&output, resized, &jpeg.Options{Quality: 78}); err != nil {
		return nil, fmt.Errorf("encode optimized screenshot: %w", err)
	}
	return output.Bytes(), nil
}

func newID() string {
	buffer := make([]byte, 12)
	if _, err := rand.Read(buffer); err != nil {
		return fmt.Sprintf("analysis-%d", time.Now().UnixNano())
	}
	return "analysis-" + hex.EncodeToString(buffer)
}
