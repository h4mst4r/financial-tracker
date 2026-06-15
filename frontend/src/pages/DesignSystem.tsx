import { useState } from 'react'
import {
  Button,
  Input,
  Label,
  Checkbox,
  Toggle,
  Dropdown,
  SegmentedControl,
  Icon,
} from '../components/primitives'
import { Home, Settings } from 'lucide-react'

const dropdownOptions = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
  { value: 'c', label: 'Option C' },
]

const segmentedOptions = [
  { value: 'all', label: 'All' },
  { value: 'mine', label: 'Mine' },
]

export function DesignSystem() {
  const [buttonClicks, setButtonClicks] = useState(0)
  const [inputValue, setInputValue] = useState('')
  const [checkboxChecked, setCheckboxChecked] = useState(false)
  const [toggleChecked, setToggleChecked] = useState(false)
  const [dropdownValue, setDropdownValue] = useState('a')
  const [segmentedValue, setSegmentedValue] = useState('all')

  return (
    <main className="min-h-screen bg-bg text-text-primary p-lg">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-medium mb-lg">Design System</h1>

        {/* Button */}
        <section id="button" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">Button</h2>
          <div className="flex flex-wrap gap-density">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button disabled>Disabled</Button>
            <Button onClick={() => setButtonClicks((p) => p + 1)}>
              Clicks: {buttonClicks}
            </Button>
          </div>
        </section>

        {/* Input */}
        <section id="input" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">Input</h2>
          <div className="flex flex-col gap-density max-w-input">
            <div>
              <Label htmlFor="input-default">Default</Label>
              <Input id="input-default" placeholder="Type something…" value={inputValue} onChange={(e) => setInputValue(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="input-error">Error</Label>
              <Input id="input-error" error placeholder="Has error" />
            </div>
            <div>
              <Label htmlFor="input-disabled">Disabled</Label>
              <Input id="input-disabled" disabled value="Cannot edit" />
            </div>
          </div>
        </section>

        {/* Label */}
        <section id="label" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">Label</h2>
          <div className="flex flex-col gap-density">
            <Label>Plain label</Label>
            <Label required>Required label</Label>
          </div>
        </section>

        {/* Checkbox */}
        <section id="checkbox" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">Checkbox</h2>
          <div className="flex flex-col gap-density">
            <Checkbox checked={checkboxChecked} onChange={setCheckboxChecked} label={`Checked: ${checkboxChecked}`} />
            <Checkbox checked={false} onChange={() => {}} disabled label="Disabled (unchecked)" />
            <Checkbox checked={true} onChange={() => {}} disabled label="Disabled (checked)" />
          </div>
        </section>

        {/* Toggle */}
        <section id="toggle" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">Toggle</h2>
          <div className="flex flex-col gap-density items-start">
            <div className="flex items-center gap-sm">
              <Toggle checked={toggleChecked} onChange={setToggleChecked} aria-label="Toggle example" />
              <span className="text-sm text-text-secondary">{toggleChecked ? 'On' : 'Off'}</span>
            </div>
            <Toggle checked={false} onChange={() => {}} disabled />
          </div>
        </section>

        {/* Dropdown */}
        <section id="dropdown" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">Dropdown</h2>
          <div className="flex flex-col gap-density max-w-input">
            <Dropdown value={dropdownValue} options={dropdownOptions} onChange={setDropdownValue} placeholder="Select…" />
            <Dropdown value="" options={dropdownOptions} onChange={() => {}} disabled placeholder="Disabled" />
          </div>
        </section>

        {/* SegmentedControl */}
        <section id="segmented-control" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">SegmentedControl</h2>
          <div className="flex flex-col gap-density max-w-input">
            <SegmentedControl value={segmentedValue} options={segmentedOptions} onChange={setSegmentedValue} />
            <SegmentedControl value="all" options={segmentedOptions} onChange={() => {}} disabled />
          </div>
        </section>

        {/* Icon */}
        <section id="icon" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">Icon</h2>
          <div className="flex items-center gap-density">
            <Icon icon={Home} size={16} />
            <Icon icon={Settings} size={20} />
            <Icon icon={Home} size={16} aria-label="Home" />
          </div>
        </section>
      </div>
    </main>
  )
}
