"use client";

import { useId } from "react";
import type { WorkflowVariableOption } from "@/lib/workflow-studio/properties-schema";

export function WorkflowVariablePicker({
  label,
  value,
  options,
  multiple = false,
  onChange,
  helpText,
}: {
  label: string;
  value: string | readonly string[];
  options: readonly WorkflowVariableOption[];
  multiple?: boolean;
  onChange: (value: string | string[]) => void;
  helpText?: string;
}) {
  const inputId = useId();
  const textValue = Array.isArray(value) ? value.join(", ") : String(value);
  return <div className="workflow-variable-picker">
    <label htmlFor={inputId}>{label}</label>
    <input
      id={inputId}
      value={textValue}
      onChange={(event) => onChange(multiple
        ? [...new Set(event.target.value.split(",").map((item) => item.trim()).filter(Boolean))]
        : event.target.value)}
      placeholder={multiple ? "variabele_een, variabele_twee" : "workflowvariabele"}
    />
    {options.length > 0 && <select aria-label={`${label} kiezen`} value="" onChange={(event) => {
      if (!event.target.value) return;
      onChange(multiple
        ? [...new Set([...(Array.isArray(value) ? value : []), event.target.value])]
        : event.target.value);
    }}><option value="">Kies bestaande variabele</option>{options.map((option) => <option value={option.id} key={`${option.sourceNodeKey}:${option.id}`}>{option.label} · {option.valueType}</option>)}</select>}
    {helpText && <small>{helpText}</small>}
  </div>;
}
