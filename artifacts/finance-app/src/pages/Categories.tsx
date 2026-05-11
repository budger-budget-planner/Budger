import { useState } from "react";
import {
  useListCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  getListCategoriesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const PRESET_COLORS = [
  "#818cf8", "#34d399", "#fb923c", "#f472b6", "#38bdf8",
  "#a78bfa", "#fbbf24", "#f87171", "#4ade80", "#60a5fa",
  "#e879f9", "#2dd4bf", "#facc15", "#fb7185", "#a3e635",
];

function CategoryCard({ category }: { category: any }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);
  const [budget, setBudget] = useState(category.budget != null ? String(category.budget) : "");

  const update = useUpdateCategory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
        setEditing(false);
      },
    },
  });
  const remove = useDeleteCategory({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() }),
    },
  });

  function handleSave() {
    update.mutate({
      id: category.id,
      data: {
        name,
        color,
        budget: budget !== "" ? parseFloat(budget) : null,
      },
    });
  }

  function handleCancel() {
    setName(category.name);
    setColor(category.color);
    setBudget(category.budget != null ? String(category.budget) : "");
    setEditing(false);
  }

  const budgetPct = category.budget != null && category.budget > 0
    ? Math.min((category.spent ?? 0) / category.budget * 100, 100)
    : null;

  return (
    <div
      data-testid={`card-category-${category.id}`}
      className="bg-card border border-card-border rounded-xl p-4 group hover:shadow-md transition-shadow"
    >
      {editing ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex-shrink-0 border border-border" style={{ backgroundColor: color }} />
            <Input
              data-testid={`input-category-name-${category.id}`}
              value={name}
              onChange={e => setName(e.target.value)}
              className="h-8 text-sm"
              autoFocus
            />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-2">Color</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className="w-6 h-6 rounded-full border-2 transition-all"
                  style={{ backgroundColor: c, borderColor: color === c ? "white" : "transparent", outline: color === c ? `2px solid ${c}` : "none" }}
                  onClick={() => setColor(c)}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                className="w-6 h-6 rounded-full cursor-pointer border border-border bg-transparent"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Monthly Budget (optional)</p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                data-testid={`input-category-budget-${category.id}`}
                type="number"
                min="0"
                step="0.01"
                placeholder="No limit"
                value={budget}
                onChange={e => setBudget(e.target.value)}
                className="pl-7 h-8 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleCancel} className="flex-1 h-7">
              <X className="w-3.5 h-3.5 mr-1" /> Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={update.isPending} className="flex-1 h-7" data-testid={`button-save-category-${category.id}`}>
              <Check className="w-3.5 h-3.5 mr-1" /> Save
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex-shrink-0 cursor-pointer hover:scale-105 transition-transform"
              style={{ backgroundColor: category.color }}
              onClick={() => setEditing(true)}
              data-testid={`button-edit-category-${category.id}`}
            />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{category.name}</p>
              <p className="text-xs text-muted-foreground">
                {category.budget != null ? `Budget: $${Number(category.budget).toFixed(2)}/mo` : "No budget set"}
              </p>
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => setEditing(true)}
                data-testid={`button-edit-open-${category.id}`}
              >
                Edit
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="w-7 h-7 text-destructive hover:text-destructive"
                onClick={() => remove.mutate({ id: category.id })}
                data-testid={`button-delete-category-${category.id}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          {category.budget != null && category.budget > 0 && (
            <div className="mt-3 space-y-1">
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
                {category.spent != null ? `$${Number(category.spent).toFixed(2)} spent` : "No spending yet"}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#818cf8");
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
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Categories</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Organize spending with color-coded categories and monthly budgets</p>
        </div>
        <Button onClick={() => setAddOpen(true)} data-testid="button-add-category" className="gap-2">
          <Plus className="w-4 h-4" /> New Category
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : categories && categories.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map(cat => <CategoryCard key={cat.id} category={cat} />)}
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <Plus className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">No categories yet.</p>
          <Button className="mt-5" onClick={() => setAddOpen(true)} data-testid="button-create-first-category">
            Create your first category
          </Button>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Category</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                data-testid="input-new-category-name"
                placeholder="Groceries, Coffee, Rent..."
                value={newName}
                onChange={e => setNewName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    className="w-7 h-7 rounded-full border-2 transition-all"
                    style={{ backgroundColor: c, borderColor: newColor === c ? "white" : "transparent", outline: newColor === c ? `2px solid ${c}` : "none" }}
                    onClick={() => setNewColor(c)}
                  />
                ))}
                <input
                  type="color"
                  value={newColor}
                  onChange={e => setNewColor(e.target.value)}
                  className="w-7 h-7 rounded-full cursor-pointer"
                />
              </div>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-7 h-7 rounded-lg" style={{ backgroundColor: newColor }} />
                <span className="text-sm font-mono text-muted-foreground">{newColor}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Monthly Budget (optional)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  data-testid="input-new-budget"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="No limit"
                  value={newBudget}
                  onChange={e => setNewBudget(e.target.value)}
                  className="pl-7"
                />
              </div>
              <p className="text-xs text-muted-foreground">Set a monthly limit to track spending against this category.</p>
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={create.isPending} data-testid="button-save-new-category">
                {create.isPending ? "Creating..." : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
