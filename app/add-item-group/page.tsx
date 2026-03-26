"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, getApiErrorMessage } from "@/lib/api";

type ItemGroupRow = {
  name?: string;
  item_group_name?: string;
  is_group?: unknown;
};

function isGroupFolder(v: unknown): boolean {
  return v === 1 || v === true || v === "1" || Number(v) === 1;
}

export default function AddItemGroupPage() {
  const [itemGroupName, setItemGroupName] = useState("");
  const [parentOptions, setParentOptions] = useState<string[]>([]);
  const [parentItemGroup, setParentItemGroup] = useState("");
  const [loadingParents, setLoadingParents] = useState(true);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const loadParents = async () => {
      setLoadingParents(true);
      try {
        let folders: string[] = [];
        try {
          const res = await api.get<{ data?: ItemGroupRow[] }>("/api/resource/Item Group", {
            params: {
              fields: JSON.stringify(["name", "item_group_name", "is_group"]),
              limit_page_length: 5000,
              order_by: "name asc"
            }
          });
          folders = (res.data?.data ?? [])
            .filter((row) => isGroupFolder(row.is_group))
            .map((row) => (row.name || row.item_group_name || "").trim())
            .filter(Boolean);
        } catch {
          const res = await api.get<{ message?: unknown }>("/api/method/frappe.client.get_list", {
            params: {
              doctype: "Item Group",
              fields: JSON.stringify(["name", "item_group_name", "is_group"]),
              limit_page_length: 5000,
              order_by: "name asc"
            }
          });
          const list = res.data?.message;
          if (Array.isArray(list)) {
            folders = list
              .map((row) => {
                if (!row || typeof row !== "object") return "";
                const r = row as ItemGroupRow;
                if (!isGroupFolder(r.is_group)) return "";
                return (r.name || r.item_group_name || "").trim();
              })
              .filter(Boolean);
          }
        }

        const options = Array.from(new Set(folders)).sort((a, b) => a.localeCompare(b));
        setParentOptions(options);
        if (options.length > 0 && !options.includes(parentItemGroup)) {
          setParentItemGroup(options[0]);
        }
      } catch {
        setParentOptions([]);
      } finally {
        setLoadingParents(false);
      }
    };

    void loadParents();
  }, []);

  const canSubmit = useMemo(() => itemGroupName.trim().length > 0 && parentItemGroup.trim().length > 0, [
    itemGroupName,
    parentItemGroup
  ]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setSuccessMessage("");

    const name = itemGroupName.trim();
    const parent = parentItemGroup.trim();

    try {
      try {
        await api.post("/api/resource/Item Group", {
          item_group_name: name,
          parent_item_group: parent,
          is_group: 0
        });
      } catch {
        await api.post("/api/method/frappe.client.insert", {
          doc: {
            doctype: "Item Group",
            item_group_name: name,
            parent_item_group: parent,
            is_group: 0
          }
        });
      }

      setSuccessMessage(`Item Group created: ${name}`);
      setItemGroupName("");
    } catch (error) {
      alert(getApiErrorMessage(error, "Failed to create Item Group."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-xl rounded-xl bg-white p-6 shadow-sm">
      <h1 className="mb-2 text-2xl font-bold text-slate-900">Add Item Group</h1>
      <p className="mb-6 text-sm text-slate-600">
        Creates a leaf Item Group (`is_group = 0`) so it can be selected while creating lots/items.
      </p>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Item Group Name</label>
          <input
            value={itemGroupName}
            onChange={(e) => setItemGroupName(e.target.value)}
            required
            className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
            placeholder="e.g. EMS Lots"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Parent Item Group</label>
          {parentOptions.length > 0 ? (
            <select
              value={parentItemGroup}
              onChange={(e) => setParentItemGroup(e.target.value)}
              disabled={loadingParents}
              className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring disabled:bg-slate-100"
            >
              {parentOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={parentItemGroup}
              onChange={(e) => setParentItemGroup(e.target.value)}
              required
              className="w-full rounded-lg border px-3 py-2 outline-none ring-slate-300 focus:ring"
              placeholder="Enter exact parent Item Group name from ERPNext"
            />
          )}
          <p className="mt-1 text-xs text-slate-500">
            {parentOptions.length > 0 ?
              "Parent groups loaded from ERPNext."
            : "Could not load parent groups automatically. Enter the exact parent Item Group name."}
          </p>
        </div>

        <button
          type="submit"
          disabled={loading || !canSubmit}
          className="w-full rounded-xl bg-slate-900 px-4 py-3 text-lg font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
        >
          {loading ? "Creating..." : "Create Item Group"}
        </button>
      </form>

      {successMessage ? (
        <p className="mt-4 rounded-lg bg-emerald-100 px-3 py-2 text-sm text-emerald-800">
          {successMessage}
        </p>
      ) : null}
    </section>
  );
}
