import { useState } from "react";
import { t } from "@/lib/i18n";
import {
  useListCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  getListCategoriesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { loadPrefs, currencySymbol, fmtAmt, fmtAmtRound } from "@/lib/prefs";

const PRESET_COLORS = [
  "#818cf8", "#34d399", "#fb923c", "#f472b6", "#38bdf8",
  "#a78bfa", "#fbbf24", "#f87171", "#4ade80", "#60a5fa",
  "#e879f9", "#2dd4bf", "#facc15", "#fb7185", "#a3e635",
];

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PRESET_COLORS.map(c => (
        <button
          key={c}
          type="button"
          className="w-7 h-7 rounded-full border-2 transition-all"
          style={{
            backgroundColor: c,
            borderColor: value === c ? "white" : "transparent",
            outline: value === c ? `2px solid ${c}` : "none",
          }}
          onClick={() => onChange(c)}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-7 h-7 rounded-full cursor-pointer border border-border bg-transparent"
        title="Custom color"
      />
    </div>
  );
}

function BudgetInput({
  rawValue,
  onRawChange,
  mode,
  onModeChange,
  totalBudget,
  sym,
}: {
  rawValue: string;
  onRawChange: (v: string) => void;
  mode: "amount" | "percent";
  onModeChange: (m: "amount" | "percent") => void;
  totalBudget: number | null;
  sym: string;
}) {
  const numVal       = parseFloat(rawValue) || 0;
  const dollarVal    = mode === "percent" ? (totalBudget ? (numVal / 100) * totalBudget : null) : numVal;
  const exceedsTotal = totalBudget != null && dollarVal != null && dollarVal > totalBudget && rawValue !== "";
  const noTotalForPct = mode === "percent" && totalBudget == null;

  return (
    <div className="space-y-2">
      {/* Mode toggle */}
      <div className="flex rounded-lg overflow-hidden border border-border w-fit">
        <button
          type="button"
          onClick={() => { onModeChange("amount"); onRawChange(""); }}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === "amount" ? "bg-foreground text-background" : "bg-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {sym} {t("common.amount")}
        </button>
        <button
          type="button"
          onClick={() => { onModeChange("percent"); onRawChange(""); }}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === "percent" ? "bg-foreground text-background" : "bg-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("cat.amount_pct").split("/")[1] ?? "% of total"}
        </button>
      </div>

      {/* Input */}
      {mode === "amount" ? (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{sym}</span>
          <Input
            type="number" min="0" step="0.01" placeholder={t("common.no_limit")}
            value={rawValue} onChange={e => onRawChange(e.target.value)}
            className="pl-7"
          />
        </div>
      ) : noTotalForPct ? (
        <p className="text-xs text-amber-400 py-1">
          Set your total monthly budget on the Home tab first to use % mode.
        </p>
      ) : (
        <div className="space-y-1.5">
          <div className="relative">
            <Input
              type="number" min="0" max="100" step="1" placeholder="e.g. 20"
              value={rawValue} onChange={e => onRawChange(e.target.value)}
              className="pr-8"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
          </div>
          {rawValue && dollarVal != null && (
            <p className="text-xs text-muted-foreground">
              = {fmtAmt(dollarVal, loadPrefs().currency)}
              {totalBudget && ` (${numVal}% of ${fmtAmtRound(totalBudget, loadPrefs().currency)})`}
            </p>
          )}
        </div>
      )}

      {/* Validation */}
      {exceedsTotal && totalBudget != null && (
        <p className="text-xs text-red-400 font-medium">
          ⚠ Exceeds total monthly budget ({fmtAmtRound(totalBudget, loadPrefs().currency)}) — please enter a lower amount.
        </p>
      )}
    </div>
  );
}

function resolveBudgetDollars(rawValue: string, mode: "amount" | "percent", totalBudget: number | null): number | null {
  if (rawValue === "") return null;
  const num = parseFloat(rawValue);
  if (isNaN(num)) return null;
  if (mode === "percent") {
    if (totalBudget == null) return null;
    return (num / 100) * totalBudget;
  }
  return num;
}

function CategoryCard({ category, onEdit, currency }: { category: any; onEdit: () => void; currency: string }) {
  const sym = currencySymbol(currency);
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const remove = useDeleteCategory({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() }),
    },
  });

  return (
    <div
      data-testid={`card-category-${category.id}`}
      className="bg-card border border-border rounded-2xl overflow-hidden"
    >
      <div className="h-1.5" style={{ backgroundColor: category.color }} />
      <div className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl flex-shrink-0"
            style={{ backgroundColor: category.color + "33" }}>
            <div className="w-full h-full rounded-xl flex items-center justify-center">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: category.color }} />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">{category.name}</p>
            <p className="text-xs text-muted-foreground">
              {category.budget != null
                ? `${t("cat.budget")} ${fmtAmtRound(Number(category.budget), currency)}${t("cat.mo")}`
                : t("cat.no_budget")}
            </p>
          </div>
        </div>

        {category.budget != null && category.budget > 0 && (
          <div className="mb-3 space-y-1">
            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min((category.spent ?? 0) / category.budget * 100, 100)}%`,
                  backgroundColor: (category.spent ?? 0) > category.budget ? "#f87171" : category.color,
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {fmtAmt(Number(category.spent ?? 0), currency)} of {fmtAmt(Number(category.budget), currency)}
            </p>
          </div>
        )}

        {confirmDelete ? (
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmDelete(false)}
              className="flex-1 py-2 rounded-xl bg-muted text-xs font-medium text-muted-foreground transition active:opacity-70"
            >
              Cancel
            </button>
            <button
              onClick={() => remove.mutate({ id: category.id })}
              disabled={remove.isPending}
              className="flex-1 py-2 rounded-xl bg-destructive text-xs font-medium text-destructive-foreground transition active:opacity-70 disabled:opacity-40"
              data-testid={`button-delete-category-${category.id}`}
            >
              {remove.isPending ? t("common.deleting") : t("common.delete")}
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={onEdit}
              data-testid={`button-edit-open-${category.id}`}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                         bg-muted text-xs font-medium text-muted-foreground transition active:opacity-70"
            >
              <Pencil className="w-3.5 h-3.5" /> {t("common.edit")}
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                         bg-destructive/10 text-xs font-medium text-destructive transition active:opacity-70"
            >
              <Trash2 className="w-3.5 h-3.5" /> {t("common.delete")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function EditDialog({ category, open, onClose, totalBudget, sym }: {
  category: any; open: boolean; onClose: () => void;
  totalBudget: number | null; sym: string;
}) {
  const queryClient = useQueryClient();
  const [name,       setName]       = useState(category.name);
  const [color,      setColor]      = useState(category.color);
  const [budgetMode, setBudgetMode] = useState<"amount" | "percent">("amount");
  const [budget,     setBudget]     = useState(category.budget != null ? String(Number(category.budget).toFixed(0)) : "");

  const update = useUpdateCategory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
        onClose();
      },
    },
  });

  function handleSave() {
    const dollars = resolveBudgetDollars(budget, budgetMode, totalBudget);
    update.mutate({ id: category.id, data: { name, color, budget: dollars } });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t("cat.edit")}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex-shrink-0" style={{ backgroundColor: color }} />
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t("cat.cat_name")}
              autoFocus
              data-testid={`input-category-name-${category.id}`}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">{t("cat.color_label")}</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("cat.monthly_budget_opt")}</Label>
            <BudgetInput
              rawValue={budget}
              onRawChange={setBudget}
              mode={budgetMode}
              onModeChange={setBudgetMode}
              totalBudget={totalBudget}
              sym={sym}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              <X className="w-3.5 h-3.5 mr-1" /> {t("common.cancel")}
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={update.isPending}
              data-testid={`button-save-category-${category.id}`}>
              <Check className="w-3.5 h-3.5 mr-1" />
              {update.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const prefs       = loadPrefs();
  const sym         = currencySymbol(prefs.currency);
  const totalBudget = prefs.totalBudget;

  const [addOpen,       setAddOpen]       = useState(false);
  const [editCat,       setEditCat]       = useState<any | null>(null);
  const [newName,       setNewName]       = useState("");
  const [newColor,      setNewColor]      = useState("#818cf8");
  const [newBudgetMode, setNewBudgetMode] = useState<"amount" | "percent">("amount");
  const [newBudget,     setNewBudget]     = useState("");

  const { data: categories, isLoading } = useListCategories();
  const create = useCreateCategory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
        setAddOpen(false);
        setNewName("");
        setNewColor("#818cf8");
        setNewBudget("");
        setNewBudgetMode("amount");
      },
    },
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const dollars = resolveBudgetDollars(newBudget, newBudgetMode, totalBudget);
    create.mutate({ data: { name: newName.trim(), color: newColor, icon: "tag", budget: dollars } });
  }

  const catBudgetSum = (categories ?? []).reduce((s, c) => s + (c.budget != null ? Number(c.budget) : 0), 0);
  const catBudgetExceeds = totalBudget != null && catBudgetSum > totalBudget;

  return (
    <div className="px-4 pt-5 pb-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-bold">{t("cat.title")}</h1>
          <p className="text-muted-foreground text-xs mt-0.5">{t("cat.subtitle")}</p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          data-testid="button-add-category"
          className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-foreground text-background
                     text-sm font-semibold transition active:scale-95"
        >
          <Plus className="w-4 h-4" /> {t("cat.add_btn")}
        </button>
      </div>

      {/* Budget summary banner */}
      {totalBudget != null && catBudgetSum > 0 && (
        <div className={`mb-4 px-4 py-3 rounded-xl border text-sm ${
          catBudgetExceeds
            ? "border-red-500/30 bg-red-500/10"
            : "border-white/10 bg-white/5"
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-white/60">{t("cat.budgets_total")}</span>
            <span className={`font-semibold ${catBudgetExceeds ? "text-red-400" : ""}`}>
              {fmtAmtRound(catBudgetSum, prefs.currency)} / {fmtAmtRound(totalBudget, prefs.currency)}
            </span>
          </div>
          {catBudgetExceeds && (
            <p className="text-xs text-red-400 mt-1">
              Category budgets exceed your total monthly budget by {fmtAmtRound(catBudgetSum - totalBudget, prefs.currency)}.
            </p>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : categories && categories.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {categories.map(cat => (
            <CategoryCard key={cat.id} category={cat} onEdit={() => setEditCat(cat)} currency={prefs.currency} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
            <Plus className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">{t("cat.no_categories")}</p>
          <button onClick={() => setAddOpen(true)}
            className="px-5 py-2.5 rounded-2xl bg-foreground text-background text-sm font-semibold transition active:scale-95">
            Create first category
          </button>
        </div>
      )}

      {/* Edit dialog */}
      {editCat && (
        <EditDialog
          category={editCat}
          open={!!editCat}
          onClose={() => setEditCat(null)}
          totalBudget={totalBudget}
          sym={sym}
        />
      )}

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("cat.new")}</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("cat.name_label")}</Label>
              <Input
                data-testid="input-new-category-name"
                placeholder={t("cat.placeholder")}
                value={newName} onChange={e => setNewName(e.target.value)}
                required autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>{t("cat.color_label")}</Label>
              <ColorPicker value={newColor} onChange={setNewColor} />
              <div className="flex items-center gap-2 mt-1">
                <div className="w-6 h-6 rounded-lg" style={{ backgroundColor: newColor }} />
                <span className="text-xs font-mono text-muted-foreground">{newColor}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("cat.monthly_budget_opt")}</Label>
              <BudgetInput
                rawValue={newBudget}
                onRawChange={setNewBudget}
                mode={newBudgetMode}
                onModeChange={setNewBudgetMode}
                totalBudget={totalBudget}
                sym={sym}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setAddOpen(false)}>{t("common.cancel")}</Button>
              <Button type="submit" className="flex-1" disabled={create.isPending}
                data-testid="button-save-new-category">
                {create.isPending ? t("common.saving") : t("cat.create_btn")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
