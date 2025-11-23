declare module 'react-window' {
  import * as React from 'react'
  export interface ListChildComponentProps {
    index: number
    style: React.CSSProperties
  }
  export interface FixedSizeListProps extends React.ComponentProps<'div'> {
    height: number
    itemCount: number
    itemSize: number
    width: number | string
    children: React.ComponentType<ListChildComponentProps>
  }
  export class FixedSizeList extends React.Component<FixedSizeListProps> {}
  export default FixedSizeList
}
