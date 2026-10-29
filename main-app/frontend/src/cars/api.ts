import { carResponseSchema, carsResponseSchema, type AddCarRequest, type Car } from "@parking/shared";
import { sendRequest } from "../api-request";

export const carsQueryKey = ["cars"];

export async function fetchCars(): Promise<Car[]> {
  return carsResponseSchema.parse(await sendRequest("GET", "/api/cars")).cars;
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
