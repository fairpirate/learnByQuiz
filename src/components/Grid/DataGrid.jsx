import { useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
} from "ag-grid-community";
ModuleRegistry.registerModules([AllCommunityModule]);
const theme = themeQuartz.withParams({
  accentColor: "#216b4e",
  borderColor: "#dbe4df",
  borderRadius: 10,
  fontFamily: "inherit",
  fontSize: 13,
  headerBackgroundColor: "#eef5f0",
  rowHoverColor: "#f4f8f5",
});
export default function DataGrid({
  label,
  rows = [],
  columns,
  searchable = true,
  exportable = true,
  paginate = true,
  context,
  getRowHeight,
}) {
  const api = useRef(null);
  const cache = useRef(new Map());
  const rowData = useMemo(() => {
    const next = new Map();
    const data = rows.map((row, i) => {
      const key = String(row.id ?? row.entity_id ?? i),
        previous = cache.current.get(key);
      const same =
        previous &&
        Object.keys(previous).length === Object.keys(row).length + 1 &&
        Object.keys(row).every((k) => previous[k] === row[k]);
      const value = same ? previous : { ...row, __gridId: key };
      next.set(key, value);
      return value;
    });
    cache.current = next;
    return data;
  }, [rows]);
  const [search, setSearch] = useState("");
  const defaults = useMemo(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
      flex: 1,
      minWidth: 120,
      wrapText: true,
      autoHeight: true,
      cellStyle: { lineHeight: "1.6", paddingTop: 10, paddingBottom: 10 },
    }),
    [],
  );
  return (
    <div className="learning-grid" role="region" aria-label={label}>
      <div className="learning-grid-toolbar">
        {searchable && (
          <label>
            Filter {label}
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search all columns…"
            />
          </label>
        )}
        {exportable && (
          <button
            type="button"
            className="secondary"
            onClick={() =>
              api.current?.exportDataAsCsv({
                fileName: `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`,
                processCellCallback: (p) =>
                  /^(?:\s*[=+@-]|[\t\r\n])/.test(String(p.value ?? ""))
                    ? `'${p.value}`
                    : p.value,
              })
            }
          >
            Export CSV
          </button>
        )}
      </div>
      <AgGridReact
        theme={theme}
        rowData={rowData}
        getRowId={(p) => p.data.__gridId}
        context={context}
        getRowHeight={getRowHeight}
        onColumnResized={
          getRowHeight
            ? (e) => {
                if (e.finished) e.api.resetRowHeights();
              }
            : undefined
        }
        columnDefs={columns}
        defaultColDef={defaults}
        domLayout="autoHeight"
        quickFilterText={search}
        pagination={paginate && rows.length > 10}
        paginationPageSize={10}
        paginationPageSizeSelector={[10, 20, 50]}
        suppressScrollOnNewData
        animateRows={false}
        ensureDomOrder
        suppressColumnVirtualisation
        suppressCellFocus={false}
        onGridReady={(e) => {
          api.current = e.api;
        }}
        overlayNoRowsTemplate="<span>No records yet</span>"
      />
    </div>
  );
}
