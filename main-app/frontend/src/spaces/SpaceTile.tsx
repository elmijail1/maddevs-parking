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
    const parked = myParking.status === "active";
    const state = parked ? `${myParking.regNumber} is parked here` : `booked for ${myParking.regNumber}`;
    const colors = parked
      ? "border-green-600 bg-green-300 text-green-950"
      : "border-yellow-500 bg-yellow-300 text-yellow-900";
    return (
      <button
        type="button"
        aria-label={`${space.displayName}, ${state}`}
        className={`${tileClassName} animate-pulse cursor-pointer flex-col gap-1 px-1 ${colors}`}
        onClick={() => onSelectMine(myParking)}
      >
        {space.displayName}
        <span aria-hidden className="w-full truncate text-xs font-medium" title={myParking.carName}>
          {myParking.carName}
        </span>
        <span aria-hidden className="w-full break-all text-xs font-normal">
          {myParking.regNumber}
        </span>
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
