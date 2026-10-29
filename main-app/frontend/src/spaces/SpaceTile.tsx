import type { MyParking, Space } from "@parking/shared";

const tileClassName = "flex h-36 w-24 items-center justify-center rounded-md border-4 text-xl font-semibold";

export function SpaceTile({
  space,
  myParking,
  onSelect,
  onSelectMine,
}: {
  space: Space;
  myParking: MyParking | undefined;
  onSelect: (space: Space) => void;
  onSelectMine: (parking: MyParking) => void;
}) {
  if (myParking) {
    const state =
      myParking.status === "booked" ? `booked for ${myParking.regNumber}` : `${myParking.regNumber} is parked here`;
    return (
      <button
        type="button"
        aria-label={`${space.displayName}, ${state}`}
        className={`${tileClassName} animate-pulse cursor-pointer border-yellow-500 bg-yellow-300 text-yellow-900`}
        onClick={() => onSelectMine(myParking)}
      >
        {space.displayName}
      </button>
    );
  }
  if (space.status === "vacant") {
    return (
      <button
        type="button"
        aria-label={`${space.displayName}, available`}
        className={`${tileClassName} cursor-pointer border-green-600 text-green-700 hover:bg-green-50`}
        onClick={() => onSelect(space)}
      >
        {space.displayName}
      </button>
    );
  }
  return (
    <div
      role="img"
      aria-label={`${space.displayName}, unavailable`}
      className={`${tileClassName} border-red-600 text-red-700`}
    >
      {space.displayName}
    </div>
  );
}
