/**
 * IsolationForest — Full implementation of Liu, Ting & Zhou (2008)
 *
 * In production: runs on AMD Instinct MI300X via ROCm/HIP (MIOpen BLAS kernels).
 * Here: pure JS implementation. Same math, browser runtime.
 *
 * Algorithm:
 *   1. Build nTrees isolation trees on random subsamples of baseline data
 *   2. Each tree randomly selects a feature and split point
 *   3. Anomalies isolate in fewer splits (sparse feature-space region)
 *   4. Score = 2^(-avgPathLength / c(subsampleSize))
 *      → 1.0 = definite anomaly, 0.5 = normal, <0.5 = very normal
 */

class IsoNode {
  constructor({ leaf = false, size = 0, feature = null, splitVal = 0, left = null, right = null } = {}) {
    this.leaf = leaf
    this.size = size       // only used in leaf nodes for path length correction
    this.feature = feature // split feature name
    this.splitVal = splitVal
    this.left = left
    this.right = right
  }
}

class IsoTree {
  /**
   * c(n) — Expected path length for a random BST of size n
   * (Euler-Mascheroni correction for incomplete traversal at leaf nodes)
   */
  c(n) {
    if (n <= 1) return 0
    if (n === 2) return 1
    return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1) / n)
  }

  build(data, features, maxDepth, depth = 0) {
    if (depth >= maxDepth || data.length <= 1) {
      return new IsoNode({ leaf: true, size: data.length })
    }
    // Random feature selection
    const feat = features[Math.floor(Math.random() * features.length)]
    const vals = data.map(x => x[feat])
    const mn = Math.min(...vals)
    const mx = Math.max(...vals)
    // Can't split if all values identical → leaf
    if (mn >= mx) return new IsoNode({ leaf: true, size: data.length })
    // Random split between min and max
    const split = mn + Math.random() * (mx - mn)
    return new IsoNode({
      feature: feat, splitVal: split,
      left:  this.build(data.filter(x => x[feat] < split),  features, maxDepth, depth + 1),
      right: this.build(data.filter(x => x[feat] >= split), features, maxDepth, depth + 1),
    })
  }

  /**
   * path length for a data point through this tree
   * Leaf nodes add c(leafSize) to account for unseen path
   */
  pathLength(node, point, depth = 0) {
    if (node.leaf) return depth + this.c(node.size)
    return point[node.feature] < node.splitVal
      ? this.pathLength(node.left,  point, depth + 1)
      : this.pathLength(node.right, point, depth + 1)
  }
}

export class IsolationForest {
  constructor(nTrees = 80, subsampleSize = 128) {
    this.nTrees = nTrees
    this.sub = subsampleSize
    this.trained = false
    this.forest = []  // array of { tree: IsoTree, root: IsoNode, cNorm: number }
    this.features = ['rate', 'errorRate', 'p99', 'saturation']
  }

  /** Random subsample without replacement */
  _subsample(data, n) {
    const shuffled = [...data].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, Math.min(n, shuffled.length))
  }

  /**
   * Train on historical baseline data.
   * Called once 48+ baseline ticks are collected.
   */
  train(data) {
    if (data.length < 10) return false
    const maxDepth = Math.ceil(Math.log2(this.sub))
    this.forest = Array.from({ length: this.nTrees }, () => {
      const sample = this._subsample(data, this.sub)
      const tree = new IsoTree()
      return {
        tree,
        root: tree.build(sample, this.features, maxDepth),
        cNorm: tree.c(this.sub)
      }
    })
    this.trained = true
    return true
  }

  /**
   * Score a single data point.
   * Returns 0.0–1.0, higher = more anomalous.
   */
  score(point) {
    if (!this.trained) return 0.5
    const avgPath = this.forest.reduce((sum, { tree, root }) =>
      sum + tree.pathLength(root, point), 0) / this.nTrees
    return Math.pow(2, -avgPath / this.forest[0].cNorm)
  }

  /** Score multiple points — returns array */
  scoreAll(points) {
    return points.map(p => ({ ...p, ifScore: this.score(p) }))
  }

  getStats() {
    return {
      trained: this.trained,
      nTrees: this.nTrees,
      subsampleSize: this.sub,
      maxDepth: Math.ceil(Math.log2(this.sub)),
    }
  }

  reset() {
    this.trained = false
    this.forest = []
  }
}
