"use strict";
/*
 * School types. The platform administrator picks one when adding a school (pre-primary, junior
 * secondary or senior secondary); it decides the
 * starting classes, subjects, marking scheme and what some roles are called.
 * Everything except the role names can still be changed later in School Setup.
 */
const settingsLib = require("./settings");

const TYPES = {
  jss: {
    label: "Junior Secondary School",
    roles: { principal: "Principal", examofficer: "Exam Officer" },
    classes: ["JSS1", "JSS2", "JSS3"],
    subjects: [
      "English Language", "Mathematics", "Integrated Science", "Social Studies", "Agricultural Science", "Business Studies",
      "Home Economics", "Introductory Technology", "French", "Religious Moral Education (RME)", "Physical Health Education (PHE)",
    ],
    settings: {},
  },
  sss: {
    label: "Senior Secondary School",
    roles: { principal: "Principal", examofficer: "Exam Officer" },
    classes: ["SSS1", "SSS2", "SSS3"],
    subjects: [
      "English Language", "Mathematics", "Biology", "Chemistry", "Physics", "Economics", "Government", "Geography",
      "History", "Literature in English", "Business Management", "Financial Accounting", "Cost Accounting",
      "Religious Moral Education (RME)", "Physical Health Education (PHE)",
    ],
    settings: {},
  },
  // schools added before the junior/senior split run JSS1 to SSS3 together
  secondary: {
    label: "Secondary School (JSS and SSS)",
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
