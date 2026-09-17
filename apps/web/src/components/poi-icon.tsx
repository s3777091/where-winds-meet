import {
  Butterfly,
  Cat,
  DiamondsFour,
  Fire,
  Footprints,
  Handshake,
  Jar,
  MapPin,
  PawPrint,
  PuzzlePiece,
  Scroll,
  Sparkle,
  Tent,
  TreasureChest,
  YinYang,
} from "@phosphor-icons/react/ssr";
import type { IconWeight } from "@phosphor-icons/react";
import type { POICategory } from "@/lib/types";

interface POIIconProps {
  category: POICategory;
  sourceCategory?: string;
  size?: number;
  weight?: IconWeight;
}

export function isWaypointCategory(sourceCategory?: string): boolean {
  return sourceCategory === "Boundary Stone";
}

export function POIIcon({ category, sourceCategory, size = 17, weight = "fill" }: POIIconProps) {
  const props = { size, weight, "aria-hidden": true } as const;

  switch (sourceCategory) {
    case "Boundary Stone":
      return <DiamondsFour {...props} />;
    case "Encounter":
      return <Sparkle {...props} />;
    case "Meow Meow":
      return <Cat {...props} />;
    case "Cat Play":
      return <PawPrint {...props} />;
    case "Universal Harmony":
      return <YinYang {...props} />;
    case "Treasure Chest":
      return <TreasureChest {...props} />;
    case "Oddity":
      return <Butterfly {...props} />;
    case "Injustice Quest":
      return <Scroll {...props} />;
    case "Camp":
      return <Tent {...props} />;
    case "Wild Ritual Ghost Fire":
      return <Fire {...props} />;
    case "Hidden Path":
      return <Footprints {...props} />;
    case "Antiques":
      return <Jar {...props} />;
    case "Martial Fellowship":
      return <Handshake {...props} />;
  }

  if (category === "chest") return <TreasureChest {...props} />;
  if (category === "oddity") return <Butterfly {...props} />;
  if (category === "quest") return <Scroll {...props} />;
  if (category === "puzzle") return <PuzzlePiece {...props} />;
  return <MapPin {...props} />;
}
