import DataGrid from "./DataGrid";
function SelectCell({ data, context }) {
  return (
    <label>
      <input
        type="checkbox"
        aria-label={data.name}
        checked={data.selected}
        disabled={context.disabled}
        onChange={() => context.onToggle(data.name)}
      />{" "}
      Select
    </label>
  );
}
const columns = [
  { field: "name", headerName: "Name", minWidth: 180 },
  {
    field: "selected",
    headerName: "Include",
    sortable: false,
    filter: false,
    cellRenderer: SelectCell,
    cellRendererParams: { suppressMouseEventHandling: () => true },
  },
];
export default function PreferenceGrid({
  label,
  options,
  selected,
  disabled,
  onToggle,
}) {
  return (
    <DataGrid
      label={label}
      rows={options.map((name) => ({
        id: name,
        name,
        selected: selected.includes(name),
      }))}
      columns={columns}
      context={{ disabled, onToggle }}
      searchable={false}
      exportable={false}
    />
  );
}
