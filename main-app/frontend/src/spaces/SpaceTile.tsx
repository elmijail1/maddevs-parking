import type { Space } from "@parking/shared";

const tileClassName = "flex h-36 w-24 items-center justify-center rounded-md border-4 text-xl font-semibold";

export function SpaceTile({ space, onSelect }: { space: Space; onSelect: (space: Space) => void }) {
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
