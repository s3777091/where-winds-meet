INSERT INTO regions (id, name, fixture, geometry, provenance)
VALUES (
  'DEV_QINGHE',
  'Qinghe (DEV fixtures)',
  true,
  ST_Multi(ST_GeomFromText('POLYGON((-0.115 -0.08, -0.09 0.072, 0.015 0.112, 0.126 0.058, 0.11 -0.086, 0.005 -0.118, -0.115 -0.08))', 4326)),
  '{"source":"Project-owned development fixture","source_type":"dev_fixture","verification_status":"fixture","patch_version":"dev-2026-09"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO pois (
  id, name, category, region_id, subregion, location, floor, entrance, entrance_location,
  nearest_landmark, requirements, navigation_steps, solution_steps, common_mistake, provenance
)
VALUES
  (
    'DEV_QH_CHEST_001', 'DEV Riverside Supply Chest', 'chest', 'DEV_QINGHE', 'DEV West Bank',
    ST_SetSRID(ST_MakePoint(-0.071, -0.011), 4326), 'B1', 'DEV cave opening on the north riverbank',
    ST_SetSRID(ST_MakePoint(-0.079, -0.004), 4326), 'DEV Timber Footbridge', '["DEV Fire Arrow"]'::jsonb,
    '["Start at the DEV Timber Footbridge and follow the river west.","Use the cave opening at water level instead of descending from the ridge.","Follow the left tunnel to the lower chamber."]'::jsonb,
    '["Clear the DEV training enemies in the chamber.","Use the DEV Fire Arrow on the marked vines.","Open the fixture chest behind the stone screen."]'::jsonb,
    'The fixture cannot be reached from the cliff directly above it.',
    '{"source":"Project-owned development fixture","source_type":"dev_fixture","verification_status":"fixture","patch_version":"dev-2026-09"}'::jsonb
  ),
  (
    'DEV_QH_CHEST_002', 'DEV Watchtower Chest', 'chest', 'DEV_QINGHE', 'DEV Northern Rise',
    ST_SetSRID(ST_MakePoint(-0.038, 0.051), 4326), 'Surface', 'DEV broken stair on the east face',
    ST_SetSRID(ST_MakePoint(-0.033, 0.046), 4326), 'DEV Signal Tower', '[]'::jsonb,
    '["Approach the DEV Signal Tower from the east path.","Climb the broken exterior stair and cross the timber beam."]'::jsonb,
    '["Defeat the fixture guard at the upper platform.","Open the chest beside the signal brazier."]'::jsonb,
    'The west wall is decorative and has no climb route.',
    '{"source":"Project-owned development fixture","source_type":"dev_fixture","verification_status":"fixture","patch_version":"dev-2026-09"}'::jsonb
  ),
  (
    'DEV_QH_CHEST_003', 'DEV Sunken Courtyard Chest', 'chest', 'DEV_QINGHE', 'DEV Reed Basin',
    ST_SetSRID(ST_MakePoint(0.071, -0.039), 4326), 'B2', 'DEV well behind the ruined courtyard',
    ST_SetSRID(ST_MakePoint(0.059, -0.031), 4326), 'DEV Reed Gate', '["DEV Courtyard Key"]'::jsonb,
    '["Enter the DEV Reed Gate courtyard from the southern path.","Drop through the marked well and take the second ladder down."]'::jsonb,
    '["Unlock the fixture grate with the DEV Courtyard Key.","Drain the shallow room with the nearby lever.","Open the chest on the lower stone shelf."]'::jsonb,
    'The first underground room is B1. Continue down to B2.',
    '{"source":"Project-owned development fixture","source_type":"dev_fixture","verification_status":"fixture","patch_version":"dev-2026-09"}'::jsonb
  ),
  (
    'DEV_QH_ODDITY_001', 'DEV Wind Bell Oddity', 'oddity', 'DEV_QINGHE', 'DEV Willow Terrace',
    ST_SetSRID(ST_MakePoint(0.019, 0.061), 4326), 'Surface', 'DEV upper terrace path', NULL,
    'DEV Twin Willows', '[]'::jsonb,
    '["Follow the terrace path north from the DEV Twin Willows.","Look for the bell hanging under the final wooden arch."]'::jsonb,
    '["Interact with the three fixture chimes from lowest to highest.","Collect the revealed oddity beneath the center arch."]'::jsonb,
    'Do not strike the large bell first. It resets the fixture sequence.',
    '{"source":"Project-owned development fixture","source_type":"dev_fixture","verification_status":"fixture","patch_version":"dev-2026-09"}'::jsonb
  ),
  (
    'DEV_QH_ODDITY_002', 'DEV Moss Stone Oddity', 'oddity', 'DEV_QINGHE', 'DEV Eastern Shelf',
    ST_SetSRID(ST_MakePoint(0.088, 0.042), 4326), 'Surface', 'DEV ridge trail from the south', NULL,
    'DEV Three Pines', '["DEV Observation skill"]'::jsonb,
    '["Take the ridge trail north from the DEV Three Pines.","Stop at the moss-covered stones above the path."]'::jsonb,
    '["Use the DEV Observation skill to reveal the correct stone.","Inspect the highlighted carving."]'::jsonb,
    'The bright stone beside the path is a decoy fixture.',
    '{"source":"Project-owned development fixture","source_type":"dev_fixture","verification_status":"fixture","patch_version":"dev-2026-09"}'::jsonb
  ),
  (
    'DEV_QH_PUZZLE_001', 'DEV Lantern Alignment', 'puzzle', 'DEV_QINGHE', 'DEV Central Crossing',
    ST_SetSRID(ST_MakePoint(-0.012, 0.008), 4326), 'Surface', 'DEV courtyard gate', NULL,
    'DEV Stone Crossing', '[]'::jsonb,
    '["Cross the DEV Stone Crossing and enter the courtyard to the north.","The four lantern stands surround the central tile."]'::jsonb,
    '["Rotate each fixture lantern toward the central tile.","Stand on the tile after all four beams meet."]'::jsonb,
    'One lantern is on the roof edge, not at ground level.',
    '{"source":"Project-owned development fixture","source_type":"dev_fixture","verification_status":"fixture","patch_version":"dev-2026-09"}'::jsonb
  ),
  (
    'DEV_QH_PUZZLE_002', 'DEV Echo Chamber', 'puzzle', 'DEV_QINGHE', 'DEV Western Hollow',
    ST_SetSRID(ST_MakePoint(-0.085, 0.032), 4326), 'B1', 'DEV narrow gap behind the waterfall',
    ST_SetSRID(ST_MakePoint(-0.091, 0.025), 4326), 'DEV Veil Falls', '[]'::jsonb,
    '["Descend to the pool below the DEV Veil Falls.","Walk through the narrow gap behind the falling water."]'::jsonb,
    '["Repeat the fixture tones in the order shown by the wall lights.","Use the opened passage to collect the completion token."]'::jsonb,
    'The upper cave is not connected to the puzzle chamber.',
    '{"source":"Project-owned development fixture","source_type":"dev_fixture","verification_status":"fixture","patch_version":"dev-2026-09"}'::jsonb
  ),
  (
    'DEV_QH_QUEST_001', 'DEV Ferryman Request', 'quest', 'DEV_QINGHE', 'DEV South Ferry',
    ST_SetSRID(ST_MakePoint(0.025, -0.072), 4326), 'Surface', 'DEV ferry landing', NULL,
    'DEV South Ferry Bell', '["DEV River Token"]'::jsonb,
    '["Follow the river path south to the DEV ferry landing.","Speak to the fixture ferryman beside the moored boat."]'::jsonb,
    '["Give the ferryman the DEV River Token.","Complete the short fixture delivery across the river.","Return to the landing for the quest completion."]'::jsonb,
    'The quest remains incomplete until you return to the original landing.',
    '{"source":"Project-owned development fixture","source_type":"dev_fixture","verification_status":"fixture","patch_version":"dev-2026-09"}'::jsonb
  ),
  (
    'DEV_QH_QUEST_002', 'DEV Herbalist Trail', 'quest', 'DEV_QINGHE', 'DEV Eastern Meadow',
    ST_SetSRID(ST_MakePoint(0.093, -0.002), 4326), 'Surface', 'DEV meadow footpath', NULL,
    'DEV Red Canopy', '["DEV Ferryman Request complete"]'::jsonb,
    '["Take the meadow path east from the DEV Red Canopy.","Find the fixture herbalist beside the low stone wall."]'::jsonb,
    '["Collect three marked DEV herbs along the meadow edge.","Return them to the fixture herbalist."]'::jsonb,
    'The required herbs appear only after the prerequisite fixture quest.',
    '{"source":"Project-owned development fixture","source_type":"dev_fixture","verification_status":"fixture","patch_version":"dev-2026-09"}'::jsonb
  )
ON CONFLICT (id) DO NOTHING;
