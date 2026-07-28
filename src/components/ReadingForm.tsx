import { useState, useRef, useCallback, type FormEvent, type ChangeEvent, type MouseEvent } from "react";

interface ReadingData {
  photo: Blob | null;
  photoPreview: string | null;
  latitude: number | null;
  longitude: number | null;
  numericValue: number | null;
  notes: string;
  timestamp: string;
  siteId: number | null;
  siteName: string;
}

interface ReadingFormProps {
  onSubmit: (reading: ReadingData) => Promise<void>;
  isSubmitting?: boolean;
}

interface FormErrors {
  siteId?: string;
  photo?: string;
  latitude?: string;
  numericValue?: string;
}

type FormStep = "site" | "photo" | "location" | "value";

const STEPS: FormStep[] = ["site", "photo", "location", "value"];

// Inline SVG icons following the Terminus design system
const Icons = {
  Camera: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="14" rx="2" />
      <circle cx="12" cy="13" r="4" />
      <path d="M7 6V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  Location: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="10" r="3" />
      <path d="M12 2a8 8 0 0 0-8 8c0 5.4 8 12 8 12s8-6.6 8-12a8 8 0 0 0-8-8z" />
    </svg>
  ),
  Check: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  ChevronLeft: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  ),
  ChevronRight: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  ),
  AlertCircle: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  Refresh: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  ),
};

// Sample sites - in production these would come from a context/provider
const SAMPLE_SITES = [
  { id: 1, name: "Alpha Station" },
  { id: 2, name: "Beta Terminal" },
  { id: 3, name: "Gamma Outpost" },
  { id: 4, name: "Delta Hub" },
];

export function ReadingForm({ onSubmit, isSubmitting = false }: ReadingFormProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = STEPS[stepIndex];

  const [formData, setFormData] = useState<ReadingData>({
    photo: null,
    photoPreview: null,
    latitude: null,
    longitude: null,
    numericValue: null,
    notes: "",
    timestamp: new Date().toISOString(),
    siteId: null,
    siteName: "",
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateCurrentStep = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    switch (currentStep) {
      case "site":
        if (!formData.siteId) {
          newErrors.siteId = "Select a site to continue";
        }
        break;
      case "photo":
        if (!formData.photo) {
          newErrors.photo = "Capture a photo to continue";
        }
        break;
      case "location":
        if (!formData.latitude || !formData.longitude) {
          newErrors.latitude = "Get a GPS fix or enter coordinates manually";
        }
        break;
      case "value":
        if (formData.numericValue === null || isNaN(formData.numericValue)) {
          newErrors.numericValue = "Enter a numeric value";
        }
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [currentStep, formData]);

  const goToNextStep = useCallback(() => {
    if (validateCurrentStep()) {
      setStepIndex((prev) => Math.min(prev + 1, STEPS.length - 1));
    }
  }, [validateCurrentStep]);

  const goToPrevStep = useCallback(() => {
    setErrors({});
    setStepIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const handleSiteChange = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    const siteId = e.target.value ? parseInt(e.target.value, 10) : null;
    const site = SAMPLE_SITES.find((s) => s.id === siteId);
    setFormData((prev) => ({
      ...prev,
      siteId,
      siteName: site?.name ?? "",
    }));
    if (errors.siteId) {
      setErrors((prev) => ({ ...prev, siteId: undefined }));
    }
  }, [errors.siteId]);

  const handlePhotoCapture = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setFormData((prev) => ({
          ...prev,
          photo: file,
          photoPreview: reader.result as string,
        }));
        if (errors.photo) {
          setErrors((prev) => ({ ...prev, photo: undefined }));
        }
      };
      reader.readAsDataURL(file);
    }
  }, [errors.photo]);

  const handleRetake = useCallback(() => {
    setFormData((prev) => ({
      ...prev,
      photo: null,
      photoPreview: null,
    }));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleGetLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError("Geolocation is not supported on this device");
      return;
    }

    setGpsLoading(true);
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFormData((prev) => ({
          ...prev,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }));
        setGpsLoading(false);
        if (errors.latitude) {
          setErrors((prev) => ({ ...prev, latitude: undefined }));
        }
      },
      (error) => {
        let message = "Failed to get location";
        switch (error.code) {
          case error.PERMISSION_DENIED:
            message = "Location permission denied";
            break;
          case error.POSITION_UNAVAILABLE:
            message = "Location unavailable";
            break;
          case error.TIMEOUT:
            message = "Location request timed out";
            break;
        }
        setGpsError(message);
        setGpsLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }, [errors.latitude]);

  const handleManualLocation = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    // Allow manual entry - show inputs for manual lat/lon
    const lat = window.prompt("Enter latitude:");
    if (lat) {
      const lon = window.prompt("Enter longitude:");
      if (lon) {
        const latNum = parseFloat(lat);
        const lonNum = parseFloat(lon);
        if (!isNaN(latNum) && !isNaN(lonNum) && latNum >= -90 && latNum <= 90 && lonNum >= -180 && lonNum <= 180) {
          setFormData((prev) => ({
            ...prev,
            latitude: latNum,
            longitude: lonNum,
          }));
          if (errors.latitude) {
            setErrors((prev) => ({ ...prev, latitude: undefined }));
          }
        }
      }
    }
  }, [errors.latitude]);

  const handleNumericValueChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const numValue = value ? parseFloat(value) : null;
    setFormData((prev) => ({
      ...prev,
      numericValue: numValue,
    }));
    if (errors.numericValue) {
      setErrors((prev) => ({ ...prev, numericValue: undefined }));
    }
  }, [errors.numericValue]);

  const handleNotesChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setFormData((prev) => ({
      ...prev,
      notes: e.target.value.slice(0, 280),
    }));
  }, []);

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!validateCurrentStep()) {
      return;
    }

    try {
      await onSubmit({
        ...formData,
        timestamp: new Date().toISOString(),
      });
      // Reset form after successful submission
      setFormData({
        photo: null,
        photoPreview: null,
        latitude: null,
        longitude: null,
        numericValue: null,
        notes: "",
        timestamp: new Date().toISOString(),
        siteId: null,
        siteName: "",
      });
      setStepIndex(0);
    } catch (err) {
      // Error handling is done by the parent via onSubmit
      console.error("Form submission failed:", err);
    }
  }, [formData, onSubmit, validateCurrentStep]);

  const renderStepIndicator = () => (
    <ol className="flex gap-2 mb-6" aria-label="Capture progress">
      {STEPS.map((step, index) => (
        <li
          key={step}
          className={`h-1 flex-1 rounded-full transition-colors ${
            index <= stepIndex ? "bg-[#f5a623]" : "bg-[#232830]"
          }`}
          aria-current={index === stepIndex ? "step" : "false"}
        />
      ))}
    </ol>
  );

  const renderSiteStep = () => (
    <div className="space-y-4">
      <div className="bg-[#16191d] border border-[#232830] rounded-[14px] p-4">
        <h2 className="font-[Rajdhani] text-lg font-semibold text-[#e8eaed] mb-2">Site</h2>
        <p className="text-[#aab0b8] text-[15px]">
          Pick the site you are at. The site name rides with the reading so a supervisor can group the data later.
        </p>
      </div>

      <div className="space-y-1">
        <label htmlFor="site" className="text-[14px] text-[#aab0b8]">
          <span className="font-medium text-[#e8eaed]">Site name</span>
        </label>
        <select
          id="site"
          name="site"
          value={formData.siteId ?? ""}
          onChange={handleSiteChange}
          required
          autoComplete="off"
          className={`w-full min-h-[48px] px-3 py-3 bg-[#0d0f11] text-[#e8eaed] border rounded-[10px] outline-none transition-colors
            ${errors.siteId ? "border-[#c0524f]" : "border-[#232830]"}
            focus:border-[#f5a623] focus:ring-2 focus:ring-[#f5a623]/20`}
        >
          <option value="">Select a site…</option>
          {SAMPLE_SITES.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
        </select>
        {errors.siteId && (
          <p className="text-[#c0524f] text-sm flex items-center gap-1.5 mt-1">
            <Icons.AlertCircle />
            {errors.siteId}
          </p>
        )}
      </div>
    </div>
  );

  const renderPhotoStep = () => (
    <div className="space-y-4">
      <div className="bg-[#16191d] border border-[#232830] rounded-[14px] p-4">
        <h2 className="font-[Rajdhani] text-lg font-semibold text-[#e8eaed] mb-2">Photo</h2>
        <p className="text-[#aab0b8] text-[15px]">
          One frame is enough. The photo is encrypted on-device before it ever leaves your phone.
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />

      <div
        className={`aspect-square w-full max-w-[280px] mx-auto bg-[#16191d] border-2 border-dashed rounded-[14px] flex items-center justify-center text-[#aab0b8] overflow-hidden
          ${errors.photo ? "border-[#c0524f]" : "border-[#232830]"}
          ${formData.photoPreview ? "border-solid" : ""}`}
      >
        {formData.photoPreview ? (
          <img
            src={formData.photoPreview}
            alt="Captured photo preview"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="text-center p-4">
            <Icons.Camera />
            <p className="mt-2 text-sm">No photo yet</p>
          </div>
        )}
      </div>
      {errors.photo && (
        <p className="text-[#c0524f] text-sm flex items-center gap-1.5 justify-center">
          <Icons.AlertCircle />
          {errors.photo}
        </p>
      )}

      <div className="flex gap-2 justify-center">
        {!formData.photo ? (
          <button
            type="button"
            onClick={handlePhotoCapture}
            className="min-h-[48px] px-6 py-3 bg-[#f5a623] text-[#0d0f11] font-semibold rounded-[10px] transition-colors hover:bg-[#e09820] focus:ring-2 focus:ring-[#f5a623]/40"
          >
            Capture
          </button>
        ) : (
          <button
            type="button"
            onClick={handleRetake}
            className="min-h-[48px] px-6 py-3 bg-[#16191d] text-[#e8eaed] border border-[#232830] font-semibold rounded-[10px] transition-colors hover:border-[#f5a623] focus:ring-2 focus:ring-[#f5a623]/40 flex items-center gap-2"
          >
            <Icons.Refresh />
            Retake
          </button>
        )}
      </div>
    </div>
  );

  const renderLocationStep = () => (
    <div className="space-y-4">
      <div className="bg-[#16191d] border border-[#232830] rounded-[14px] p-4">
        <h2 className="font-[Rajdhani] text-lg font-semibold text-[#e8eaed] mb-2">Location</h2>
        <p className="text-[#aab0b8] text-[15px]">
          GPS reads once. Re-tap if you are indoors and the first fix was poor.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3" role="group" aria-label="Coordinates">
        <div className="space-y-1">
          <label htmlFor="lat" className="text-[14px] text-[#aab0b8]">
            <span className="font-medium text-[#e8eaed]">Latitude</span>
          </label>
          <input
            id="lat"
            name="lat"
            type="text"
            inputMode="decimal"
            readOnly
            aria-readonly="true"
            value={formData.latitude?.toFixed(6) ?? ""}
            placeholder="—"
            className="w-full min-h-[48px] px-3 py-3 bg-[#0d0f11] text-[#e8eaed] border border-[#232830] rounded-[10px] cursor-not-allowed"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="lon" className="text-[14px] text-[#aab0b8]">
            <span className="font-medium text-[#e8eaed]">Longitude</span>
          </label>
          <input
            id="lon"
            name="lon"
            type="text"
            inputMode="decimal"
            readOnly
            aria-readonly="true"
            value={formData.longitude?.toFixed(6) ?? ""}
            placeholder="—"
            className="w-full min-h-[48px] px-3 py-3 bg-[#0d0f11] text-[#e8eaed] border border-[#232830] rounded-[10px] cursor-not-allowed"
          />
        </div>
      </div>

      {(errors.latitude || gpsError) && (
        <p className="text-[#c0524f] text-sm flex items-center gap-1.5">
          <Icons.AlertCircle />
          {errors.latitude || gpsError}
        </p>
      )}

      {formData.latitude && formData.longitude && (
        <p className="text-[#22c55e] text-sm flex items-center gap-1.5">
          <Icons.Check />
          Location captured
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleGetLocation}
          disabled={gpsLoading}
          className="flex-1 min-h-[48px] px-4 py-3 bg-[#f5a623] text-[#0d0f11] font-semibold rounded-[10px] transition-colors hover:bg-[#e09820] disabled:opacity-55 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {gpsLoading ? (
            <>
              <Icons.Refresh />
              Getting fix…
            </>
          ) : (
            <>
              <Icons.Location />
              Get fix
            </>
          )}
        </button>
        <button
          type="button"
          onClick={handleManualLocation}
          className="min-h-[48px] px-4 py-3 bg-[#16191d] text-[#e8eaed] border border-[#232830] font-semibold rounded-[10px] transition-colors hover:border-[#f5a623] focus:ring-2 focus:ring-[#f5a623]/40"
        >
          Manual
        </button>
      </div>
    </div>
  );

  const renderValueStep = () => (
    <div className="space-y-4">
      <div className="bg-[#16191d] border border-[#232830] rounded-[14px] p-4">
        <h2 className="font-[Rajdhani] text-lg font-semibold text-[#e8eaed] mb-2">Reading</h2>
        <p className="text-[#aab0b8] text-[15px]">
          Enter the meter or gauge value. Units are set by your site profile.
        </p>
      </div>

      <div className="space-y-1">
        <label htmlFor="value" className="text-[14px] text-[#aab0b8]">
          <span className="font-medium text-[#e8eaed]">Numeric value</span>
        </label>
        <input
          id="value"
          name="value"
          type="number"
          inputMode="decimal"
          step="any"
          required
          value={formData.numericValue ?? ""}
          onChange={handleNumericValueChange}
          placeholder="0.00"
          className={`w-full min-h-[48px] px-3 py-3 bg-[#0d0f11] text-[#e8eaed] border rounded-[10px] outline-none transition-colors
            ${errors.numericValue ? "border-[#c0524f]" : "border-[#232830]"}
            focus:border-[#f5a623] focus:ring-2 focus:ring-[#f5a623]/20`}
        />
        {errors.numericValue && (
          <p className="text-[#c0524f] text-sm flex items-center gap-1.5 mt-1">
            <Icons.AlertCircle />
            {errors.numericValue}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <label htmlFor="notes" className="text-[14px] text-[#aab0b8]">
          <span className="font-medium text-[#e8eaed]">Notes (optional)</span>
          <span className="float-right text-xs">{formData.notes.length}/280</span>
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          maxLength={280}
          value={formData.notes}
          onChange={handleNotesChange}
          placeholder="Add any relevant observations…"
          className="w-full min-h-[calc(48px*2)] px-3 py-3 bg-[#0d0f11] text-[#e8eaed] border border-[#232830] rounded-[10px] outline-none transition-colors resize-y
            focus:border-[#f5a623] focus:ring-2 focus:ring-[#f5a623]/20"
        />
      </div>
    </div>
  );

  const renderStepContent = () => {
    switch (currentStep) {
      case "site":
        return renderSiteStep();
      case "photo":
        return renderPhotoStep();
      case "location":
        return renderLocationStep();
      case "value":
        return renderValueStep();
      default:
        return null;
    }
  };

  const renderNavigation = () => {
    const isFirstStep = stepIndex === 0;
    const isLastStep = stepIndex === STEPS.length - 1;

    return (
      <div className="flex gap-2 pt-4">
        {!isFirstStep && (
          <button
            type="button"
            onClick={goToPrevStep}
            className="flex-1 min-h-[48px] px-4 py-3 bg-[#16191d] text-[#e8eaed] border border-[#232830] font-semibold rounded-[10px] transition-colors hover:border-[#f5a623] focus:ring-2 focus:ring-[#f5a623]/40 flex items-center justify-center gap-2"
          >
            <Icons.ChevronLeft />
            Back
          </button>
        )}
        {isLastStep ? (
          <button
            type="submit"
            form="reading-form"
            disabled={isSubmitting}
            className="flex-1 min-h-[48px] px-4 py-3 bg-[#f5a623] text-[#0d0f11] font-semibold rounded-[10px] transition-colors hover:bg-[#e09820] disabled:opacity-55 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Saving…" : "Save offline"}
          </button>
        ) : (
          <button
            type="button"
            onClick={goToNextStep}
            className="flex-1 min-h-[48px] px-4 py-3 bg-[#f5a623] text-[#0d0f11] font-semibold rounded-[10px] transition-colors hover:bg-[#e09820] focus:ring-2 focus:ring-[#f5a623]/40 flex items-center justify-center gap-2"
          >
            Continue
            <Icons.ChevronRight />
          </button>
        )}
      </div>
    );
  };

  return (
    <form
      id="reading-form"
      onSubmit={handleSubmit}
      noValidate
      aria-label="New reading"
      className="max-w-[720px] mx-auto"
    >
      {renderStepIndicator()}

      <div aria-live="polite">
        {renderStepContent()}
      </div>

      {renderNavigation()}
    </form>
  );
}
