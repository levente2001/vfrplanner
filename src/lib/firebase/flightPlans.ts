                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type DocumentData,
} from "firebase/firestore/lite";
import type { WaypointMeta } from "@/lib/vfr/nav";
import { getFirebaseServices } from "./client";

export type SavedLegCondition = {
  altitudeFt: string;
  tas: string;
  fuelFlow: string;
  windDir: string;
  windSpeed: string;
};

export type FlightPlanPayload = {
  name: string;
  waypointText: string;
  waypoints: WaypointMeta[];
  tas: string;
  fuelFlow: string;
  fuelUnit: "L" | "USG";
  windDir: string;
  windSpeed: string;
  variationValue: string;
  variationDirection: "E" | "W";
  legConditions: SavedLegCondition[];
  pohTasTable: string;
  departureAltitude: string;
  climbRate: string;
  climbFuelFlow: string;
  alternateFuelMode: "none" | "custom";
  alternateFuel: string;
};

export type SavedFlightPlan = FlightPlanPayload & {
  id: string;
  updatedAt?: unknown;
};

function userPlansCollection(uid: string) {
  const services = getFirebaseServices();
  if (!services) throw new Error("Firebase is not configured.");
  return collection(services.db, "users", uid, "flightPlans");
}

function fromDoc(id: string, data: DocumentData): SavedFlightPlan {
  return {
    id,
    name: typeof data.name === "string" ? data.name : "Untitled flight plan",
    waypointText: typeof data.waypointText === "string" ? data.waypointText : "",
    waypoints: Array.isArray(data.waypoints) ? data.waypoints : [],
    tas: typeof data.tas === "string" ? data.tas : "100",
    fuelFlow: typeof data.fuelFlow === "string" ? data.fuelFlow : "20",
    fuelUnit: data.fuelUnit === "USG" ? "USG" : "L",
    windDir: typeof data.windDir === "string" ? data.windDir : "270",
    windSpeed: typeof data.windSpeed === "string" ? data.windSpeed : "10",
    variationValue: typeof data.variationValue === "string" ? data.variationValue : "5",
    variationDirection: data.variationDirection === "W" ? "W" : "E",
    legConditions: Array.isArray(data.legConditions)
      ? data.legConditions.map((item: DocumentData) => ({
          altitudeFt: typeof item?.altitudeFt === "string" ? item.altitudeFt : "",
          tas: typeof item?.tas === "string" ? item.tas : "",
          fuelFlow: typeof item?.fuelFlow === "string" ? item.fuelFlow : "",
          windDir: typeof item?.windDir === "string" ? item.windDir : "",
          windSpeed: typeof item?.windSpeed === "string" ? item.windSpeed : "",
        }))
      : [],
    pohTasTable: typeof data.pohTasTable === "string" ? data.pohTasTable : "",
    departureAltitude:
      typeof data.departureAltitude === "string" ? data.departureAltitude : "0",
    climbRate: typeof data.climbRate === "string" ? data.climbRate : "500",
    climbFuelFlow:
      typeof data.climbFuelFlow === "string" ? data.climbFuelFlow : data.fuelFlow ?? "8",
    alternateFuelMode: data.alternateFuelMode === "custom" ? "custom" : "none",
    alternateFuel: typeof data.alternateFuel === "string" ? data.alternateFuel : "0",
    updatedAt: data.updatedAt,
  };
}

export async function listFlightPlans(uid: string) {
  const snap = await getDocs(query(userPlansCollection(uid), orderBy("updatedAt", "desc")));
  return snap.docs.map((item) => fromDoc(item.id, item.data()));
}

export async function saveFlightPlan(uid: string, payload: FlightPlanPayload, id?: string | null) {
  if (id) {
    await updateDoc(doc(userPlansCollection(uid), id), {
      ...payload,
      updatedAt: serverTimestamp(),
    });
    return id;
  }
  const created = await addDoc(userPlansCollection(uid), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return created.id;
}

export async function deleteFlightPlan(uid: string, id: string) {
  await deleteDoc(doc(userPlansCollection(uid), id));
}
