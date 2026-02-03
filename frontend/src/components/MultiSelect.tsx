import Select, { type FormatOptionLabelMeta } from "react-select";

type Option = { label: string; value: string };

interface Props {
  options: Option[];
  value?: Option[];
  onChange: (select: string[]) => void;
  /** Custom render for each option (e.g. card SVG) */
  formatOptionLabel?: (option: Option, meta: FormatOptionLabelMeta<Option>) => React.ReactNode;
}
export const MultiSelect = (props: Props) => (
  <Select
    isMulti
    name="multiselect"
    options={props.options}
    value={props.value}
    onChange={(newValue) => {
      props.onChange((newValue ?? []).map((o) => o.value));
    }}
    formatOptionLabel={props.formatOptionLabel}
    className="basic-multi-select"
    classNamePrefix="select"
  />
);
