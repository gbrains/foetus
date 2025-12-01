const defaultFields = [
  { id: "project", label: "Project", type: "text", required: true },
  { id: "discipline", label: "Discipline", type: "select", options: ["Civil", "Mechanical", "Electrical", "Architectural", "Other"], required: true },
  { id: "location", label: "Location", type: "text", required: true },
  { id: "asset", label: "Asset / Component", type: "text" },
  { id: "description", label: "Issue Description", type: "textarea", required: true },
  { id: "impact", label: "Impact", type: "select", options: ["Low", "Medium", "High"], required: true },
  { id: "urgency", label: "Urgency", type: "select", options: ["Low", "Medium", "High"], required: true },
  { id: "warrantyEnd", label: "Warranty End Date", type: "date" },
  { id: "attachments", label: "Links to Evidence", type: "url" }
];

let fieldConfig = [...defaultFields];
let tickets = [];

const form = document.getElementById("request-form");
const formStatus = document.getElementById("form-status");
const ticketTableBody = document.getElementById("ticket-table-body");
const reportContent = document.getElementById("report-content");
const managerSection = document.getElementById("manager-section");
const managerToggle = document.getElementById("manager-mode-toggle");
const fieldEditor = document.getElementById("field-editor");
const exportButton = document.getElementById("export-fields");
const addFieldButton = document.getElementById("add-field");
const fieldJson = document.getElementById("field-json");

const importanceBadge = (importance) => {
  const level = importance.toLowerCase();
  return `<span class="badge ${level}">${importance}</span>`;
};

const calculateImportance = (impact, urgency) => {
  const score = (impact === "High" ? 2 : impact === "Medium" ? 1 : 0) +
    (urgency === "High" ? 2 : urgency === "Medium" ? 1 : 0);
  if (score >= 3) return "High";
  if (score === 2) return "Medium";
  return "Low";
};

const renderForm = () => {
  form.innerHTML = "";
  fieldConfig.forEach((field) => {
    const row = document.createElement("div");
    row.className = "form-row";
    const label = document.createElement("label");
    label.textContent = field.label;
    label.htmlFor = field.id;

    let input;
    if (field.type === "textarea") {
      input = document.createElement("textarea");
    } else if (field.type === "select") {
      input = document.createElement("select");
      field.options?.forEach((option) => {
        const opt = document.createElement("option");
        opt.value = option;
        opt.textContent = option;
        input.appendChild(opt);
      });
    } else {
      input = document.createElement("input");
      input.type = field.type;
    }

    input.id = field.id;
    input.name = field.id;
    input.required = Boolean(field.required);

    row.appendChild(label);
    row.appendChild(input);
    form.appendChild(row);
  });
};

const serializeForm = () => {
  const data = {};
  fieldConfig.forEach((field) => {
    const value = form.elements[field.id]?.value || "";
    data[field.id] = value;
  });
  const importance = calculateImportance(data.impact, data.urgency);
  return { ...data, importance, status: "Submitted", updated: new Date().toISOString() };
};

const renderTickets = () => {
  ticketTableBody.innerHTML = tickets.map((ticket, index) => `
    <tr>
      <td>#${index + 1}</td>
      <td>${ticket.project || ""}</td>
      <td>${ticket.discipline || ""}</td>
      <td class="status">${ticket.status}</td>
      <td>${importanceBadge(ticket.importance)}</td>
      <td>${new Date(ticket.updated).toLocaleString()}</td>
    </tr>
  `).join("");
};

const renderReport = (mode = "project") => {
  const grouped = tickets.reduce((acc, ticket) => {
    const key = (mode === "project" ? ticket.project : ticket.discipline) || "Unspecified";
    acc[key] = acc[key] || { total: 0, high: 0, medium: 0, low: 0 };
    acc[key].total += 1;
    acc[key][ticket.importance.toLowerCase()] += 1;
    return acc;
  }, {});

  reportContent.innerHTML = Object.entries(grouped).map(([key, counts]) => `
    <div class="report-row">
      <strong>${key}</strong>
      <div>Tickets: ${counts.total}</div>
      <div>High: ${counts.high} | Medium: ${counts.medium} | Low: ${counts.low}</div>
    </div>
  `).join("") || "No tickets yet.";
};

const renderFieldEditor = () => {
  fieldEditor.innerHTML = "";
  fieldConfig.forEach((field, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "field-config";
    wrapper.innerHTML = `
      <div class="form-row">
        <label>Label</label>
        <input data-index="${index}" data-prop="label" value="${field.label}" />
      </div>
      <div class="form-row">
        <label>Field ID</label>
        <input data-index="${index}" data-prop="id" value="${field.id}" />
      </div>
      <div class="form-row">
        <label>Type</label>
        <select data-index="${index}" data-prop="type">
          ${["text", "textarea", "select", "date", "url"].map((type) => `<option value="${type}" ${field.type === type ? "selected" : ""}>${type}</option>`).join("")}
        </select>
      </div>
      <div class="form-row">
        <label><input type="checkbox" data-index="${index}" data-prop="required" ${field.required ? "checked" : ""}/> Required</label>
      </div>
      <div class="form-row">
        <label>Options (comma separated for selects)</label>
        <input data-index="${index}" data-prop="options" value="${field.options ? field.options.join(",") : ""}" />
      </div>
      <button type="button" data-remove="${index}">Remove</button>
    `;
    fieldEditor.appendChild(wrapper);
  });
  fieldJson.textContent = JSON.stringify(fieldConfig, null, 2);
};

const updateFieldConfig = (index, prop, value) => {
  const updated = { ...fieldConfig[index] };
  if (prop === "required") {
    updated.required = value.target.checked;
  } else if (prop === "options") {
    updated.options = value.target.value ? value.target.value.split(",").map((v) => v.trim()) : undefined;
  } else {
    updated[prop] = value.target.value;
  }
  fieldConfig[index] = updated;
  renderForm();
  renderFieldEditor();
};

const addNewField = () => {
  fieldConfig.push({ id: `field${Date.now()}`, label: "New Field", type: "text", required: false });
  renderForm();
  renderFieldEditor();
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  formStatus.textContent = "Submitting...";
  const ticket = serializeForm();
  tickets.push(ticket);
  renderTickets();
  renderReport();
  form.reset();

  try {
    await SharePointClient.createTicket(ticket);
    formStatus.textContent = "Saved to SharePoint and posted to Teams.";
  } catch (error) {
    console.error(error);
    formStatus.textContent = "Saved locally. Configure SharePoint credentials to sync.";
  }
});

managerToggle.addEventListener("click", () => {
  managerSection.classList.toggle("hidden");
});

fieldEditor.addEventListener("input", (event) => {
  const index = Number(event.target.dataset.index);
  const prop = event.target.dataset.prop;
  if (Number.isFinite(index) && prop) {
    updateFieldConfig(index, prop, event);
  }
});

fieldEditor.addEventListener("click", (event) => {
  if (event.target.dataset.remove) {
    const index = Number(event.target.dataset.remove);
    fieldConfig.splice(index, 1);
    renderForm();
    renderFieldEditor();
  }
});

addFieldButton.addEventListener("click", addNewField);

exportButton.addEventListener("click", () => {
  fieldJson.textContent = JSON.stringify(fieldConfig, null, 2);
});

Array.from(document.querySelectorAll("button[data-report]")).forEach((button) => {
  button.addEventListener("click", (event) => {
    Array.from(document.querySelectorAll("button[data-report]")).forEach((btn) => btn.classList.remove("active"));
    event.target.classList.add("active");
    renderReport(event.target.dataset.report);
  });
});

const refreshTickets = async () => {
  try {
    const listTickets = await SharePointClient.fetchTickets();
    tickets = listTickets;
  } catch (error) {
    console.warn("Falling back to local tickets", error);
  }
  renderTickets();
  renderReport();
};

// initial render
renderForm();
renderFieldEditor();
renderReport();
renderTickets();

// sync actions
refreshTickets();
document.getElementById("refresh-tickets").addEventListener("click", refreshTickets);
