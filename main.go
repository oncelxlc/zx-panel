package main

import (
	"fmt"
)

func main() {
	var nums []int
	for i := 1; i < 11; i++ {
		nums = append(nums, i)
	}
	fmt.Println("nums`s length is", len(nums))
	fmt.Println("nums`s capacity is", cap(nums))
	fmt.Println("nums`s content is", nums)
	oddNums := removeEven(nums)
	fmt.Println("oddNums`s length is", len(oddNums))
	fmt.Println("oddNums`s capacity is", cap(oddNums))
	fmt.Println("oddNums`s content is", oddNums)
	advancedDemo()
}

func removeEven(s []int) []int {
	var result []int
	for _, num := range s {
		if num%2 != 0 {
			result = append(result, num)
		}
	}
	return result
}

func advancedDemo() {
	a := []int{1, 2, 3, 4, 5}
	b := a[1:4]          // b 是 a 的切片，共享相同的底层数组
	b[0] = 100           // 修改 b[0] 也会修改 a[1]
	fmt.Println("a:", a) // 输出: a: [1 100 3 4 5]
	fmt.Println("b:", b) // 输出: b: [100 3 4]

	b = append(b, 200, 300)           // 可能会导致底层数组重新分配
	fmt.Println("a after append:", a) // 输出: a after append: [1 100 3 4 5] 或者 [1 100 3 4 5 200 300]
	fmt.Println("b after append:", b) // 输出: b after append: [100 3 4 200 300]
}
