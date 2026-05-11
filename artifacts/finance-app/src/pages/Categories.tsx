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

const ICONS = ["tag", "home", "car", "utensils", "shopping-bag", "heart", "coffee", "briefcase", "gift", "music", "book", "plane"];

function CategoryCard({ category }: { category: any }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);

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
    update.mutate({ id: category.id, data: { name, color } });
  }

  function handleCancel() {
    setName(category.name);
    setColor(category.color);
    setEditing(false);
  }

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
                  data-testid={`button-color-${c}`}
                  className="w-6 h-6 rounded-full border-2 transition-all"
                  style={{ backgroundColor: c, borderColor: color === c ? "white" : "transparent", outline: color === c ? `2px solid ${c}` : "none" }}
                  onClick={() => setColor(c)}
                />
              ))}
              <input
                data-testid={`input-color-picker-${category.id}`}
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                className="w-6 h-6 rounded-full cursor-pointer border border-border bg-transparent"
                title="Custom color"
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
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex-shrink-0 cursor-pointer hover:scale-105 transition-transform"
            style={{ backgroundColor: category.color }}
            onClick={() => setEditing(true)}
            data-testid={`button-edit-category-${category.id}`}
          />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{category.name}</p>
            <p className="text-xs text-muted-foreground font-mono">{category.color}</p>
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="icon"
              variant="ghost"
              className="w-7 h-7"
              onClick={() => setEditing(true)}
              data-testid={`button-edit-open-${category.id}`}
            >
              <span className="text-xs font-medium">Edit</span>
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
      )}
    </div>
  );
}

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#818cf8");

  const { data: categories, isLoading } = useListCategories();
  const create = useCreateCategory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
        setAddOpen(false);
        setNewName("");
        setNewColor("#818cf8");
      },
    },
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    create.mutate({ data: { name: newName.trim(), color: newColor, icon: "tag" } });
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Categories</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Organize your spending with custom categories</p>
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
          <p className="text-muted-foreground text-xs mt-1">Create one to start organizing your spending.</p>
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
                  data-testid="input-new-color-picker"
                  type="color"
                  value={newColor}
                  onChange={e => setNewColor(e.target.value)}
                  className="w-7 h-7 rounded-full cursor-pointer"
                />
              </div>
              <div className="flex items-center gap-2 mt-2">
                <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: newColor }} />
                <span className="text-sm font-mono text-muted-foreground">{newColor}</span>
              </div>
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
