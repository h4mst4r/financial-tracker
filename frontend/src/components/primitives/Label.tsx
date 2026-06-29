interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean
}

export function Label({ required, className, children, ...rest }: LabelProps) {
  return (
    <label
      className={`text-sm font-medium text-text-strong ${className ?? ''}`}
      {...rest}
    >
      {children}
      {required && <span className="text-error"> *</span>}
    </label>
  )
}
