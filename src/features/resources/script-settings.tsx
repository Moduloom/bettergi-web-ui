import {CascadingSelect, Choice, Field, Input, Select} from '../../components/controls';
import {SettingsList} from '../../components/collections';
import type {ScriptSetting} from './script-resources';

export function ScriptSettingsForm({fields, values, onChange}: {
  fields: readonly ScriptSetting[]; values: Record<string, unknown>; onChange: (key: string, value: unknown) => void;
}) {
  return <SettingsList>
    {fields.map(field => {
      const value = Object.hasOwn(values, field.name) ? values[field.name] : field.initial;
      const label = field.label || field.name;
      const options = (field.options ?? []).map(item => ({label: item, value: item}));
      const current = value === undefined || value === null ? '' : String(value);
      const save = (next: unknown) => onChange(field.name, next);
      switch (field.type) {
        case 'separator': return <hr key={field.name} className="bgi-divider"/>;
        case 'checkbox': return <Choice key={field.name} label={label} checked={value === true || value === 'true'} onChange={save}/>;
        case 'multi-checkbox': {
          const selected = Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
          return <Field key={field.name} label={label}><div className="bgi-wrap">
            {options.map(item => <Choice key={item.value} label={item.label} checked={selected.includes(item.value)}
              onChange={checked => save(checked ? [...selected, item.value] : selected.filter(entry => entry !== item.value))}/>)}
          </div></Field>;
        }
        case 'select': return <Field key={field.name} label={label}>
          <Select label={label} options={options} value={current} onValueChange={save}/>
        </Field>;
        case 'cascade-select': return <Field key={field.name} label={label}>
          <CascadingSelect label={label} value={current} onChange={save}
            groups={Object.entries(field.cascade ?? {}).map(([name, list]) => ({
              label: name, value: name, options: list.map(item => ({label: item, value: item})),
            }))}/>
        </Field>;
        case 'input-text': return <Field key={field.name} label={label}>
          <Input aria-label={label} value={current} onChange={event => save(event.currentTarget.value)}/>
        </Field>;
      }
    })}
  </SettingsList>;
}
