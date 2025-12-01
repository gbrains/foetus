const SharePointClient = (() => {
  const loadConfig = async () => {
    try {
      const response = await fetch("../config/sharepointConfig.json");
      if (!response.ok) throw new Error("Missing sharepointConfig.json");
      return response.json();
    } catch (error) {
      console.warn("SharePoint config missing, using local mode", error);
      return null;
    }
  };

  const buildHeaders = (token) => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  });

  const mapToListItem = (ticket) => ({
    fields: {
      Title: `${ticket.project || "Unspecified"} - ${ticket.discipline || ""}`.trim(),
      Project: ticket.project,
      Discipline: ticket.discipline,
      Location: ticket.location,
      Asset: ticket.asset,
      Description: ticket.description,
      Impact: ticket.impact,
      Urgency: ticket.urgency,
      Importance: ticket.importance,
      WarrantyEnd: ticket.warrantyEnd,
      Attachments: ticket.attachments,
      Status: ticket.status
    }
  });

  const createTicket = async (ticket) => {
    const config = await loadConfig();
    if (!config) return ticket;
    const { siteId, listId, graphToken, teamsWebhook } = config;

    const response = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items`, {
      method: "POST",
      headers: buildHeaders(graphToken),
      body: JSON.stringify(mapToListItem(ticket))
    });

    if (!response.ok) throw new Error(`SharePoint create failed: ${response.status}`);
    const created = await response.json();

    if (teamsWebhook) {
      await fetch(teamsWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "New Warranty Request",
          text: `${ticket.project || ""} (${ticket.discipline || ""}) - ${ticket.importance}`,
          themeColor: "0078D7",
          sections: [
            { activityTitle: ticket.description, activityText: `Status: ${ticket.status}` }
          ]
        })
      });
    }
    return created;
  };

  const fetchTickets = async () => {
    const config = await loadConfig();
    if (!config) return tickets || [];
    const { siteId, listId, graphToken } = config;
    const response = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items?expand=fields`, {
      headers: buildHeaders(graphToken)
    });
    if (!response.ok) throw new Error(`SharePoint fetch failed: ${response.status}`);
    const payload = await response.json();
    return payload.value.map((item) => ({
      ...item.fields,
      updated: item.fields.Modified,
      status: item.fields.Status || "Submitted",
      importance: item.fields.Importance || "Medium"
    }));
  };

  return { createTicket, fetchTickets };
})();
