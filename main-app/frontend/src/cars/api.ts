import { carResponseSchema, carsResponseSchema, type AddCarRequest, type Car, type CarsResponse } from "@parking/shared";
import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { sendRequest } from "../api-request";

export const carsQueryKey = ["cars", "list"];
export const allCarsQueryKey = ["cars", "all"];

type CarPages = InfiniteData<CarsResponse, string | undefined>;

export async function fetchCars(cursor?: string): Promise<CarsResponse> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return carsResponseSchema.parse(await sendRequest("GET", `/api/cars${query}`));
}

export async function fetchAllCars(): Promise<Car[]> {
  const cars: Car[] = [];
  let cursor: string | undefined;
  do {
    const page = await fetchCars(cursor);
    cars.push(...page.cars);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return cars;
}

export function addCarToCache(queryClient: QueryClient, car: Car) {
  queryClient.setQueryData<CarPages>(
    carsQueryKey,
    (data) =>
      data && {
        ...data,
        pages: data.pages.map((page, index) => (index === 0 ? { ...page, cars: [car, ...page.cars] } : page)),
      },
  );
  queryClient.setQueryData<Car[]>(allCarsQueryKey, (cars) => cars && [car, ...cars]);
}

export function changeCachedCars(queryClient: QueryClient, change: (cars: Car[]) => Car[]) {
  queryClient.setQueryData<CarPages>(
    carsQueryKey,
    (data) => data && { ...data, pages: data.pages.map((page) => ({ ...page, cars: change(page.cars) })) },
  );
  queryClient.setQueryData<Car[]>(allCarsQueryKey, (cars) => cars && change(cars));
}

export async function addCar(body: AddCarRequest): Promise<Car> {
  return carResponseSchema.parse(await sendRequest("POST", "/api/cars", body)).car;
}

export async function renameCar({ id, displayName }: { id: string; displayName: string }): Promise<Car> {
  return carResponseSchema.parse(await sendRequest("PATCH", `/api/cars/${id}`, { displayName })).car;
}

export async function removeCar(id: string) {
  await sendRequest("DELETE", `/api/cars/${id}`);
}
