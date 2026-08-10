"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CREATE_ACTIONS, CREATE_GRID_4, useCreatePanelClose } from "@/components/ui/create-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { createTrainingCenterAction } from "@/modules/catalog/actions";

export function CreateCenterForm() {
  const t = useTranslations("superadmin.centers");
  const router = useRouter();
  const closePanel = useCreatePanelClose();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [capacity, setCapacity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await createTrainingCenterAction({
        name,
        city: city || undefined,
        address: address || undefined,
        capacity: capacity ? Number(capacity) : undefined,
      });
      setName("");
      setCity("");
      setAddress("");
      setCapacity("");
      router.refresh();
      closePanel();
    } catch {
      setError(t("genericError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={CREATE_GRID_4}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">{t("nameLabel")}</Label>
            <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="city">{t("cityLabel")}</Label>
            <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="address">{t("addressLabel")}</Label>
            <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="capacity">{t("capacityLabel")}</Label>
            <Input id="capacity" type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          </div>
      <div className={CREATE_ACTIONS}>
        <Button type="submit" disabled={loading}>
          {loading ? t("submitting") : t("submit")}
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </form>
  );
}
