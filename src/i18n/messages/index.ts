// One namespace per area so each area's text can be edited on its own.
import * as auth from "./auth";
import * as coach from "./coach";
import * as common from "./common";
import * as glucose from "./glucose";
import * as labels from "./labels";
import * as landing from "./landing";
import * as nav from "./nav";
import * as nutrition from "./nutrition";
import * as plans from "./plans";
import * as procurement from "./procurement";
import * as progress from "./progress";
import * as settings from "./settings";
import * as today from "./today";
import * as train from "./train";

const areas = { auth, coach, common, glucose, labels, landing, nav, nutrition, plans, procurement, progress, settings, today, train };
type Areas = typeof areas;

export type Messages = { [K in keyof Areas]: Areas[K]["en"] };

export const messages = {
  en: Object.fromEntries(Object.entries(areas).map(([k, v]) => [k, v.en])) as Messages,
  zh: Object.fromEntries(Object.entries(areas).map(([k, v]) => [k, v.zh])) as Messages,
};
