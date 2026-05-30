import { NodeCircleProgram } from 'sigma/rendering'
import type { NodeDisplayData } from 'sigma/types'
import type { Attributes } from 'graphology-types'
import { hexToRgba } from '@/lib/graph/nodeReducers'

export class GlowNodeProgram<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
> extends NodeCircleProgram<N, E, G> {
  processVisibleItem(nodeIndex: number, startIndex: number, data: NodeDisplayData): void {
    super.processVisibleItem(nodeIndex, startIndex, {
      ...data,
      color: hexToRgba(data.color, 0.12),
      size: data.size + 5,
    })
  }
}
