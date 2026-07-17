import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseClickUpUrl } from "./urlParse.js";
import { defaultClickUpStatusToTriage, normalizeClickUpTask } from "./normalize.js";
import { mapClickUpStatus } from "./statusMap.js";
import { matchDeveloper, resolveAssigneeDeveloperId } from "./assigneeMatch.js";

describe("parseClickUpUrl", () => {
  it("parses workspace + task from /t/ path", () => {
    const r = parseClickUpUrl("https://app.clickup.com/t/9012077309/869dtxu9r");
    assert.equal(r.workspaceId, "9012077309");
    assert.equal(r.taskId, "869dtxu9r");
  });

  it("parses bare task id", () => {
    const r = parseClickUpUrl("869dtxu9r");
    assert.equal(r.taskId, "869dtxu9r");
  });
});

describe("normalizeClickUpTask", () => {
  it("normalizes status, priority, and assignees", () => {
    const n = normalizeClickUpTask({
      id: "869dtxu9r",
      name: "Ship Helm",
      status: { status: "in progress" },
      priority: { priority: "high" },
      due_date: "1700000000000",
      url: "https://app.clickup.com/t/869dtxu9r",
      assignees: [
        { id: 1, username: "essra sowan", email: "essrasowan711@gmail.com" },
      ],
      creator: { id: 2, username: "Ans Almebahi", email: "twechy89@gmail.com" },
    });
    assert.ok(n);
    assert.equal(n!.externalId, "869dtxu9r");
    assert.equal(n!.externalStatus, "in progress");
    assert.equal(n!.assignees.length, 1);
    assert.equal(n!.creator?.username, "Ans Almebahi");
  });
});

describe("status mapping", () => {
  it("uses explicit mapping then defaults", () => {
    assert.equal(
      mapClickUpStatus("custom", [{ clickUpStatus: "custom", triageStatus: "snoozed" }]),
      "snoozed",
    );
    assert.equal(defaultClickUpStatusToTriage("complete"), "done");
  });
});

describe("assigneeMatch", () => {
  const developers = [
    { id: "azr", displayName: "أزر محمد علي الدوكالي", workEmail: "a.aldoukali@masarat.ly" },
    { id: "essra", displayName: "اسراء عبد الباسط على صوان", workEmail: "e.sowan@masarat.ly" },
    { id: "younes", displayName: "يونس مصطفى يونس بالخير", workEmail: "y.belkher@masarat.ly" },
    { id: "ans", displayName: "أنس جمال سالم المصباحي", workEmail: "a.almesbahi@masarat.ly" },
  ];

  it("matches ClickUp username/email to workEmail", () => {
    const essra = matchDeveloper(
      { id: "99832290", username: "essra sowan", email: "essrasowan711@gmail.com" },
      developers,
    );
    assert.equal(essra?.developerId, "essra");

    const younes = matchDeveloper(
      { id: "99832332", username: "Younes Belkher", email: "younes.masarat@gmail.com" },
      developers,
    );
    assert.equal(younes?.developerId, "younes");
  });

  it("does not invent assignee from creator; uses list default only when unassigned", () => {
    assert.equal(
      resolveAssigneeDeveloperId({
        clickUpAssigneeIds: [],
        assignees: [],
        userMappings: [],
        developers,
        defaultAssigneeId: "azr",
      }),
      "azr",
    );
    assert.equal(
      resolveAssigneeDeveloperId({
        clickUpAssigneeIds: [],
        assignees: [],
        userMappings: [],
        developers,
        defaultAssigneeId: null,
      }),
      null,
    );
  });

  it("prefers explicit mapping", () => {
    assert.equal(
      resolveAssigneeDeveloperId({
        clickUpAssigneeIds: ["9"],
        assignees: [{ id: "9", username: "essra sowan", email: "x@y.com" }],
        userMappings: [{ clickUpUserId: "9", developerId: "mapped" }],
        developers,
        defaultAssigneeId: "azr",
      }),
      "mapped",
    );
  });
});
