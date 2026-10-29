import {
  directionSchema,
  formatCents,
  newEntranceResponseSchema,
  newExitResponseSchema,
  paymentResultGraceSeconds,
  paymentSessionTimeoutMinutes,
  paymentStatusResponseSchema,
  type Direction,
  type PaymentStatus,
} from "@parking/shared";
import { Command, Option } from "commander";
import { setTimeout as sleep } from "node:timers/promises";
import { env } from "./env";

const pollIntervalMs = 2000;
const paymentWaitMs = paymentSessionTimeoutMinutes * 60_000 + (paymentResultGraceSeconds + 5) * 1000;

const messages = {
  open: "OPEN: Please come in.",
  goodbye: "OPEN: Thank you, have a good trip!",
  notWorking: "CLOSED: The bar post isn't working. Please come again later.",
  no_available_spaces: "CLOSED: There are no vacant spaces. Please come again later.",
  vehicle_already_inside: "CLOSED: This car is already registered inside the lot. Please contact support.",
  no_active_parking: "CLOSED: There's no active parking for this car. Please contact support.",
  terminal_unavailable: "CLOSED: The payment terminal isn't working. Please contact support.",
  cancelled: "CLOSED: The payment was cancelled. Please try again.",
  failed: "CLOSED: The payment failed. Please try again or contact support.",
  pending: "CLOSED: No payment result was received. Please try again or contact support.",
};

function requestMainApp(path: string, body?: object) {
  return fetch(new URL(path, env.MAIN_APP_URL), {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", "x-api-key": env.SERVICE_API_KEY },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
}

function printError(error: unknown) {
  console.error(error instanceof Error ? error.message : error);
}

async function printUnexpectedResponse(response: Response) {
  console.error(`Main app responded with ${response.status}: ${await response.text()}`);
}

async function askToLetIn(regNumber: string) {
  const response = await requestMainApp("/api/new-entrance", { regNumber });
  if (!response.ok) {
    await printUnexpectedResponse(response);
    return messages.notWorking;
  }
  const result = newEntranceResponseSchema.parse(await response.json());
  return result.allowed ? messages.open : messages[result.reason];
}

async function reportEntrance(regNumber: string) {
  const response = await requestMainApp("/api/new-parking", { regNumber, time: new Date().toISOString() });
  if (!response.ok) {
    await printUnexpectedResponse(response);
  }
}

async function waitForPaymentResult(paymentId: string): Promise<PaymentStatus> {
  const deadline = Date.now() + paymentWaitMs;
  while (Date.now() < deadline) {
    await sleep(pollIntervalMs);
    try {
      const response = await requestMainApp(`/api/payments/${paymentId}`);
      if (!response.ok) {
        await printUnexpectedResponse(response);
        continue;
      }
      const { status } = paymentStatusResponseSchema.parse(await response.json());
      if (status !== "pending") {
        return status;
      }
    } catch (error) {
      printError(error);
    }
  }
  return "pending";
}

async function askToLetOut(regNumber: string) {
  const response = await requestMainApp("/api/new-exit", { regNumber });
  if (!response.ok) {
    await printUnexpectedResponse(response);
    return messages.notWorking;
  }
  const result = newExitResponseSchema.parse(await response.json());
  if (result.status === "denied") {
    return messages[result.reason];
  }
  console.log(`Please pay ${formatCents(result.total)} at the payment terminal.`);
  const status = await waitForPaymentResult(result.paymentId);
  return status === "success" ? messages.goodbye : messages[status];
}

async function handlePassthrough(regNumber: string, direction: Direction) {
  console.log(`Car ${regNumber} is approaching from the ${direction === "in" ? "outside" : "inside"}`);
  let message = messages.notWorking;
  try {
    message = await (direction === "in" ? askToLetIn(regNumber) : askToLetOut(regNumber));
  } catch (error) {
    printError(error);
  }
  console.log(message);

  if (message === messages.open) {
    await reportEntrance(regNumber).catch(printError);
  }
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
