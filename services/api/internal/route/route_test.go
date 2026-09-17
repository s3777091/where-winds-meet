package route

import (
	"math"
	"testing"

	"github.com/local/wwm-companion/services/api/internal/domain"
)

func TestBuildPrefersReachableSurfacePOI(t *testing.T) {
	start := [2]float64{0, 0}
	underground := domain.POI{ID: "UNDERGROUND", Coordinates: [2]float64{0.001, 0}, Floor: "B2"}
	surface := domain.POI{ID: "SURFACE", Coordinates: [2]float64{0.002, 0}, Floor: "Surface"}

	result := Build(start, []domain.POI{underground, surface})
	if len(result.Stops) != 2 {
		t.Fatalf("expected 2 stops, got %d", len(result.Stops))
	}
	if result.Stops[0].POI.ID != "SURFACE" {
		t.Fatalf("expected surface POI first, got %s", result.Stops[0].POI.ID)
	}
	if len(result.Geometry.Coordinates) != 3 {
		t.Fatalf("expected start plus two coordinates, got %d", len(result.Geometry.Coordinates))
	}
}

func TestBuildNeverReturnsAWorseRouteThanGreedySeed(t *testing.T) {
	start := [2]float64{0, 0}
	pois := []domain.POI{
		{ID: "A", Coordinates: [2]float64{0.012, 0.002}, Floor: "Surface"},
		{ID: "B", Coordinates: [2]float64{0.003, 0.013}, Floor: "B1"},
		{ID: "C", Coordinates: [2]float64{0.016, 0.012}, Floor: "Surface"},
		{ID: "D", Coordinates: [2]float64{0.005, 0.004}, Floor: "Surface"},
		{ID: "E", Coordinates: [2]float64{0.019, 0.001}, Floor: "B2"},
		{ID: "F", Coordinates: [2]float64{0.008, 0.017}, Floor: "Surface"},
	}
	costs := buildCostTable(start, pois)
	greedy := greedyOrder(costs)
	greedyCost := orderCost(greedy, costs)

	result := Build(start, pois)
	if result.TotalCost > greedyCost+0.001 {
		t.Fatalf("expected optimized cost <= greedy cost, got %.3f > %.3f", result.TotalCost, greedyCost)
	}
}

func TestBuildIsDeterministic(t *testing.T) {
	start := [2]float64{105.8342, 21.0278}
	pois := []domain.POI{
		{ID: "C", Coordinates: [2]float64{105.841, 21.031}, Floor: "Surface"},
		{ID: "A", Coordinates: [2]float64{105.832, 21.029}, Floor: "B1"},
		{ID: "B", Coordinates: [2]float64{105.836, 21.024}, Floor: "Surface"},
	}
	first := Build(start, pois)
	second := Build(start, pois)
	for index := range first.Stops {
		if first.Stops[index].POI.ID != second.Stops[index].POI.ID {
			t.Fatalf("expected deterministic order, stop %d differs", index)
		}
	}
	if math.Abs(first.TotalCost-second.TotalCost) > 1e-9 {
		t.Fatalf("expected deterministic cost, got %.3f and %.3f", first.TotalCost, second.TotalCost)
	}
}

func orderCost(order []int, costs costTable) float64 {
	total := 0.0
	for index, poiIndex := range order {
		if index == 0 {
			total += costs.start[poiIndex]
			continue
		}
		total += costs.between[order[index-1]][poiIndex]
	}
	return total
}
