import { directionSchema, newEntranceResponseSchema, type Direction } from "@parking/shared";
import { Command, Option } from "commander";
import { env } from "./env";

const messages = {
  open: "OPEN: Please come in.",
  notWorking: "CLOSED: The bar post isn't working. Please come again later.",
  no_available_spaces: "CLOSED: There are no vacant spaces. Please come again later.",
  vehicle_already_inside: "CLOSED: This car is already registered inside the lot. Please contact support.",
  exitNotSupported: "CLOSED: Exiting isn't supported yet.",
};

async function postToMainApp(path: string, body: object) {
  return fetch(new URL(path, env.MAIN_APP_URL), {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": env.SERVICE_API_KEY },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
}

function printError(error: unknown) {
  console.error(error instanceof Error ? error.message : error);
}

async function askToLetIn(regNumber: string) {
  const response = await postToMainApp("/api/new-entrance", { regNumber });
  if (!response.ok) {
    console.error(`Main app responded with ${response.status}: ${await response.text()}`);
    return messages.notWorking;
  }
  const result = newEntranceResponseSchema.parse(await response.json());
  return result.allowed ? messages.open : messages[result.reason];
}

async function reportEntrance(regNumber: string) {
  const response = await postToMainApp("/api/new-parking", { regNumber, time: new Date().toISOString() });
  if (!response.ok) {
    console.error(`Main app couldn't register the entrance (${response.status}): ${await response.text()}`);
  }
}

async function handleEntrance(regNumber: string) {
  let message = messages.notWorking;
  try {
    message = await askToLetIn(regNumber);
  } catch (error) {
    printError(error);
  }
  console.log(message);

  if (message === messages.open) {
    await reportEntrance(regNumber).catch(printError);
  }
}

async function handlePassthrough(regNumber: string, direction: Direction) {
  console.log(`Car ${regNumber} is approaching from the ${direction === "in" ? "outside" : "inside"}`);
  if (direction === "out") {
    console.log(messages.exitNotSupported);
    return;
  }
  await handleEntrance(regNumber);
}

await new Command()
  .name("bar-post")
  .description("Mock bar post: a car's registration number comes from the camera, the bar opens or stays closed")
  .requiredOption("-r, --reg <regNumber>", "registration number read by the camera")
  .addOption(
    new Option("-d, --direction <direction>", "where the car approaches from")
      .choices(directionSchema.options)
      .makeOptionMandatory(),
  )
  .action(({ reg, direction }: { reg: string; direction: Direction }) => handlePassthrough(reg, direction))
  .parseAsync();
