import { useState } from "react";
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

function CategoryCard({ category, onEdit }: { category: any; onEdit: () => void }) {
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
      {/* Color bar */}
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
                ? `Budget: $${Number(category.budget).toFixed(0)}/mo`
                : "No budget"}
            </p>
          </div>
        </div>

        {/* Budget progress bar */}
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
              ${Number(category.spent ?? 0).toFixed(2)} of ${Number(category.budget).toFixed(2)}
            </p>
          </div>
        )}

        {/* Action buttons — always visible */}
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
              {remove.isPending ? "Deleting…" : "Delete"}
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
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                         bg-destructive/10 text-xs font-medium text-destructive transition active:opacity-70"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function EditDialog({ category, open, onClose }: { category: any; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName]     = useState(category.name);
  const [color, setColor]   = useState(category.color);
  const [budget, setBudget] = useState(category.budget != null ? String(category.budget) : "");

  const update = useUpdateCategory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
        onClose();
      },
    },
  });

  function handleSave() {
    update.mutate({
      id: category.id,
      data: { name, color, budget: budget !== "" ? parseFloat(budget) : null },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Edit Category</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex-shrink-0" style={{ backgroundColor: color }} />
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Category name"
              autoFocus
              data-testid={`input-category-name-${category.id}`}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Color</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Monthly Budget (optional)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                type="number" min="0" step="0.01" placeholder="No limit"
                value={budget} onChange={e => setBudget(e.target.value)}
                className="pl-7"
                data-testid={`input-category-budget-${category.id}`}
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              <X className="w-3.5 h-3.5 mr-1" /> Cancel
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={update.isPending}
              data-testid={`button-save-category-${category.id}`}>
              <Check className="w-3.5 h-3.5 mr-1" />
              {update.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen]     = useState(false);
  const [editCat, setEditCat]     = useState<any | null>(null);
  const [newName, setNewName]     = useState("");
  const [newColor, setNewColor]   = useState("#818cf8");
  const [newBudget, setNewBudget] = useState("");

  const { data: categories, isLoading } = useListCategories();
  const create = useCreateCategory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
        setAddOpen(false);
        setNewName("");
        setNewColor("#818cf8");
        setNewBudget("");
      },
    },
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    create.mutate({
      data: {
        name: newName.trim(),
        color: newColor,
        icon: "tag",
        budget: newBudget !== "" ? parseFloat(newBudget) : null,
      },
    });
  }

  return (
    <div className="px-4 pt-5 pb-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold">Categories</h1>
          <p className="text-muted-foreground text-xs mt-0.5">Color-coded spending categories</p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          data-testid="button-add-category"
          className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-foreground text-background
                     text-sm font-semibold transition active:scale-95"
        >
          <Plus className="w-4 h-4" /> New
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : categories && categories.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {categories.map(cat => (
            <CategoryCard key={cat.id} category={cat} onEdit={() => setEditCat(cat)} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
            <Plus className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">No categories yet.</p>
          <button onClick={() => setAddOpen(true)}
            className="px-5 py-2.5 rounded-2xl bg-foreground text-background text-sm font-semibold transition active:scale-95">
            Create first category
          </button>
        </div>
      )}

      {/* Edit dialog */}
      {editCat && (
        <EditDialog category={editCat} open={!!editCat} onClose={() => setEditCat(null)} />
      )}

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Category</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                data-testid="input-new-category-name"
                placeholder="Groceries, Coffee, Rent…"
                value={newName} onChange={e => setNewName(e.target.value)}
                required autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <ColorPicker value={newColor} onChange={setNewColor} />
              <div className="flex items-center gap-2 mt-1">
                <div className="w-6 h-6 rounded-lg" style={{ backgroundColor: newColor }} />
                <span className="text-xs font-mono text-muted-foreground">{newColor}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Monthly Budget (optional)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  data-testid="input-new-budget"
                  type="number" min="0" step="0.01" placeholder="No limit"
                  value={newBudget} onChange={e => setNewBudget(e.target.value)}
                  className="pl-7"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={create.isPending}
                data-testid="button-save-new-category">
                {create.isPending ? "Creating…" : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
