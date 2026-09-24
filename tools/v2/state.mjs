/** Oracles inspect persisted synthetic business records, never model prose. */
export function verifyState(c, state, ids) {
  if (c.effect === "read") return null;
  const a = c.arguments,
    one = (model, id) => state[model]?.find((x) => x._id === id);
  switch (c.tool) {
    case "create_folder":
      return state.Folder?.some((x) => x.name === a.name) ?? false;
    case "move_folder":
      return one("Folder", a.folderId)?.parentFolderId === a.parentFolderId;
    case "create_flow":
      return (
        state.Flow?.some(
          (x) =>
            x.name === a.name &&
            JSON.stringify(x.wokusIds) === JSON.stringify(a.wokusIds),
        ) ?? false
      );
    case "update_flow":
      return one("Flow", a.flowId)?.name === a.name;
    case "delete_flow":
      return !one("Flow", a.flowId);
    case "update_woku":
      return one("Woku", a.wokuId)?.description === a.title;
    case "update_woku_settings":
      return Object.entries(a)
        .filter(([k]) => k !== "wokuId")
        .every(([k, v]) => one("Woku", a.wokuId)?.[k] === v);
    case "move_woku":
      return one("Woku", a.wokuId)?.folderId === a.folderId;
    case "delete_woku":
      return !one("Woku", a.wokuId);
    case "update_nps_tool":
      return one("NPSTool", a.npsToolId)?.name === a.name;
    case "delete_nps_tool":
      return !one("NPSTool", a.npsToolId);
    case "update_csat_tool":
      return one("CsatTool", a.csatToolId)?.name === a.name;
    case "delete_csat_tool":
      return !one("CsatTool", a.csatToolId);
    case "update_ces_tool":
      return one("CesTool", a.cesToolId)?.name === a.name;
    case "delete_ces_tool":
      return !one("CesTool", a.cesToolId);
    case "update_form":
      return one("Form", a.formId)?.status === a.status;
    case "update_client":
      return one("Client", a.clientId)?.email === a.email;
    case "update_ticket":
      return one("Ticket", a.ticketId)?.severity === a.severity;
    case "create_action_plan_task":
      return (
        one("ActionPlan", a.planId)?.tasks?.some((x) => x.text === a.text) ??
        false
      );
    case "update_action_plan_task":
      return (
        one("ActionPlan", a.planId)?.tasks?.find((x) => x._id === a.taskId)
          ?.text === a.text
      );
    case "delete_action_plan_task":
      return (
        one("ActionPlan", a.planId)?.tasks?.every((x) => x._id !== a.taskId) ??
        false
      );
    case "reorder_action_plan_tasks":
      return (
        JSON.stringify(
          one("ActionPlan", a.planId)
            ?.tasks?.slice()
            .sort((x, y) => x.order - y.order)
            .map((x) => x._id),
        ) === JSON.stringify(a.orderedTaskIds)
      );
    case "create_tracker":
      return (
        state.CompanyExternalTracker?.some(
          (x) => x.name === a.name && x.system === a.system,
        ) ?? false
      );
    case "update_tracker":
      return one("CompanyExternalTracker", a.trackerId)?.name === a.name;
    case "set_tracker_active":
      return one("CompanyExternalTracker", a.trackerId)?.active === a.active;
    case "assign_tracker_to_woku":
      return (
        state.WokuExternalTracker?.some(
          (x) =>
            x.wokuId === a.wokuId &&
            x.trackerId === a.trackerId &&
            x.value === a.value,
        ) ?? false
      );
    case "create_quarantine":
      return (
        state.Quarantine?.some(
          (x) =>
            x.name === a.name &&
            x.windowDurationMin === a.windowDurationMin &&
            x.maxResponsesPerRespondent === a.maxResponsesPerRespondent,
        ) ?? false
      );
    case "update_quarantine":
      return one("Quarantine", a.quarantineId)?.enabled === a.enabled;
    case "delete_quarantine":
      return !one("Quarantine", a.quarantineId);
    default:
      throw Error("Missing state oracle for " + c.tool);
  }
}
