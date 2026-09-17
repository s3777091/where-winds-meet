package route

import (
	"math"
	"sort"
	"strconv"
	"strings"

	"github.com/local/wwm-companion/services/api/internal/domain"
)

const earthRadiusKM = 6371.0

func Build(start [2]float64, pois []domain.POI) domain.RouteResult {
	orderedPOIs := append([]domain.POI(nil), pois...)
	sort.Slice(orderedPOIs, func(i, j int) bool { return orderedPOIs[i].ID < orderedPOIs[j].ID })
	result := domain.RouteResult{
		Stops: []domain.RouteStop{},
		Geometry: domain.RouteGeometry{
			Type:        "LineString",
			Coordinates: [][2]float64{start},
		},
	}
	if len(orderedPOIs) == 0 {
		return result
	}

	costs := buildCostTable(start, orderedPOIs)
	order := greedyOrder(costs)
	improveTwoOpt(order, costs)

	previousIndex := -1
	for position, poiIndex := range order {
		selected := orderedPOIs[poiIndex]
		leg := costs.start[poiIndex]
		if previousIndex >= 0 {
			leg = costs.between[previousIndex][poiIndex]
		}
		result.Stops = append(result.Stops, domain.RouteStop{
			Order:   position + 1,
			POI:     selected,
			LegCost: round(leg, 3),
		})
		result.TotalCost += leg
		result.Geometry.Coordinates = append(result.Geometry.Coordinates, selected.Coordinates)
		previousIndex = poiIndex
	}
	result.TotalCost = round(result.TotalCost, 3)
	return result
}

type costTable struct {
	start   []float64
	between [][]float64
}

func buildCostTable(start [2]float64, pois []domain.POI) costTable {
	costs := costTable{
		start:   make([]float64, len(pois)),
		between: make([][]float64, len(pois)),
	}
	for targetIndex, target := range pois {
		costs.start[targetIndex] = legCost(start, "Surface", target)
	}
	for fromIndex, from := range pois {
		costs.between[fromIndex] = make([]float64, len(pois))
		for targetIndex, target := range pois {
			if fromIndex == targetIndex {
				continue
			}
			costs.between[fromIndex][targetIndex] = legCost(from.Coordinates, from.Floor, target)
		}
	}
	return costs
}

func greedyOrder(costs costTable) []int {
	count := len(costs.start)
	order := make([]int, 0, count)
	visited := make([]bool, count)
	currentIndex := -1
	for len(order) < count {
		bestIndex := -1
		bestCost := math.MaxFloat64
		for candidate := 0; candidate < count; candidate++ {
			if visited[candidate] {
				continue
			}
			cost := costs.start[candidate]
			if currentIndex >= 0 {
				cost = costs.between[currentIndex][candidate]
			}
			if cost < bestCost {
				bestCost = cost
				bestIndex = candidate
			}
		}
		visited[bestIndex] = true
		order = append(order, bestIndex)
		currentIndex = bestIndex
	}
	return order
}

// improveTwoOpt removes expensive crossings and backtracking from the greedy
// route. Prefix sums keep each directed 2-opt candidate O(1), including the
// asymmetric entrance penalty in legCost.
func improveTwoOpt(order []int, costs costTable) {
	if len(order) < 3 {
		return
	}

	const (
		maxPasses   = 12
		improvement = 1e-9
	)
	forwardPrefix := make([]float64, len(order))
	reversePrefix := make([]float64, len(order))

	for pass := 0; pass < maxPasses; pass++ {
		for index := 1; index < len(order); index++ {
			forwardPrefix[index] = forwardPrefix[index-1] + costs.between[order[index-1]][order[index]]
			reversePrefix[index] = reversePrefix[index-1] + costs.between[order[index]][order[index-1]]
		}

		bestStart := -1
		bestEnd := -1
		bestDelta := -improvement
		for startIndex := 0; startIndex < len(order)-1; startIndex++ {
			for endIndex := startIndex + 1; endIndex < len(order); endIndex++ {
				before := forwardPrefix[endIndex] - forwardPrefix[startIndex]
				after := reversePrefix[endIndex] - reversePrefix[startIndex]

				if startIndex == 0 {
					before += costs.start[order[startIndex]]
					after += costs.start[order[endIndex]]
				} else {
					previous := order[startIndex-1]
					before += costs.between[previous][order[startIndex]]
					after += costs.between[previous][order[endIndex]]
				}
				if endIndex+1 < len(order) {
					next := order[endIndex+1]
					before += costs.between[order[endIndex]][next]
					after += costs.between[order[startIndex]][next]
				}

				delta := after - before
				if delta < bestDelta {
					bestDelta = delta
					bestStart = startIndex
					bestEnd = endIndex
				}
			}
		}

		if bestStart < 0 {
			return
		}
		for left, right := bestStart, bestEnd; left < right; left, right = left+1, right-1 {
			order[left], order[right] = order[right], order[left]
		}
	}
}

func legCost(from [2]float64, currentFloor string, poi domain.POI) float64 {
	distance := haversine(from, poi.Coordinates)
	floorPenalty := math.Abs(float64(floorLevel(currentFloor)-floorLevel(poi.Floor))) * 0.32
	entrancePenalty := 0.0
	if poi.EntranceCoordinates != nil {
		entrancePenalty = haversine(from, *poi.EntranceCoordinates)*0.3 + 0.08
	}
	requirementPenalty := float64(len(poi.Requirements)) * 0.05
	return distance + floorPenalty + entrancePenalty + requirementPenalty
}

func floorLevel(floor string) int {
	if strings.EqualFold(floor, "surface") || floor == "" {
		return 0
	}
	normalized := strings.TrimSpace(strings.ToUpper(floor))
	if strings.HasPrefix(normalized, "B") {
		level, err := strconv.Atoi(strings.TrimPrefix(normalized, "B"))
		if err == nil {
			return -level
		}
	}
	level, err := strconv.Atoi(normalized)
	if err == nil {
		return level
	}
	return 0
}

func haversine(a, b [2]float64) float64 {
	lat1 := a[1] * math.Pi / 180
	lat2 := b[1] * math.Pi / 180
	dLat := (b[1] - a[1]) * math.Pi / 180
	dLng := (b[0] - a[0]) * math.Pi / 180
	h := math.Sin(dLat/2)*math.Sin(dLat/2) + math.Cos(lat1)*math.Cos(lat2)*math.Sin(dLng/2)*math.Sin(dLng/2)
	return earthRadiusKM * 2 * math.Atan2(math.Sqrt(h), math.Sqrt(1-h))
}

func round(value float64, precision int) float64 {
	power := math.Pow10(precision)
	return math.Round(value*power) / power
}
