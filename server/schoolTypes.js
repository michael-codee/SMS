"use strict";
/*
 * School types. The platform administrator picks one when adding a school; it decides the
 * starting classes, subjects, marking scheme and what some roles are called.
 * Everything except the role names can still be changed later in School Setup.
 */
const settingsLib = require("./settings");

const TYPES = {
  secondary: {
    label: "Secondary School",
    roles: { principal: "Principal", examofficer: "Exam Officer" },
    classes: settingsLib.DEFAULT_CLASSES,
    subjects: settingsLib.DEFAULT_SUBJECTS,
    settings: {},
  },
  preprimary: {
    label: "Pre-Primary School",
    roles: { principal: "Head Teacher", examofficer: "Assessment Officer" },
    classes: ["Nursery 1", "Nursery 2", "Nursery 3"],
    subjects: [
      "Language & Literacy", "Numeracy", "Environmental Studies", "Creative Arts",
      "Music & Rhymes", "Physical Development", "Social & Emotional Development", "Religious & Moral Education",
    ],
    settings: {
      assessment: [
        { key: "classwork", label: "Class Activities", max: 40 },
        { key: "assessment", label: "End of Term Assessment", max: 60 },
      ],
      gradeScale: [
        { min: 80, max: 100, grade: "A", remark: "Excellent" },
        { min: 70, max: 79, grade: "B", remark: "Very Good" },
        { min: 60, max: 69, grade: "C", remark: "Good" },
        { min: 50, max: 59, grade: "D", remark: "Fair" },
        { min: 0, max: 49, grade: "E", remark: "Needs Support" },
      ],
      showClassPosition: false,
    },
  },
};

function typeOf(settings) {
  const t = settings && settings.schoolType;
  return TYPES[t] ? t : "secondary";
}

/* What a role is called in a school of this type, e.g. "Head Teacher" in a pre-primary school. */
function roleLabel(role, settings, base) {
  return TYPES[typeOf(settings)].roles[role] || base[role] || role;
}

module.exports = { TYPES, typeOf, roleLabel };
