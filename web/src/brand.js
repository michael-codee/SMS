/* The product's own name and logo, shown wherever no school has been chosen yet. Each school shows its own name and crest. */
export const APP_NAME = "Elite Smart School Systems";
export const APP_LOGO = "/logo.png";

/* School types: the platform administrator picks one when adding a school (see server/schoolTypes.js). */
export const SCHOOL_TYPES = {
  preprimary: "Pre-Primary School",
  jss: "Junior Secondary School",
  sss: "Senior Secondary School",
  secondary: "Secondary School (JSS and SSS)", // schools added before the junior/senior split
};
export const NEW_SCHOOL_TYPES = ["preprimary", "jss", "sss"];
export const schoolTypeLabel = (t) => SCHOOL_TYPES[t] || SCHOOL_TYPES.secondary;
