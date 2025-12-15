import Select from "react-select";

type Option = { label: string; value: string };

interface Props {
  options: Option[];
  onChange: (select: string[]) => void;
}
export const MultiSelect = (props: Props) => (
  <Select
    isMulti
    name="multiselect"
    options={props.options}
    onChange={(newValue) => {
      props.onChange(newValue.map((o) => o.value));
    }}
    className="basic-multi-select"
    classNamePrefix="select"
  />
);
