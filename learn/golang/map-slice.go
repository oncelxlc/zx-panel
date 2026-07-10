package learn

import (
	"fmt"
	"math"
	"sort"
)

// MapSliceMain 演示 map、slice 和结构体组合使用的基础操作。
func MapSliceMain() {
	var people = make(map[string]int)
	people["Alice"] = 25
	people["Bob"] = 30
	people["Charlie"] = 22

	fmt.Println(people)
	delete(people, "Bob")
	fmt.Println(people)
	if v, ok := people["David"]; ok {
		fmt.Println("David's age is", v)
	} else {
		fmt.Println("David is not in the map")
	}

	for name, age := range people {
		fmt.Printf("%s is %d years old\n", name, age)
	}

	boys := map[string]int{
		"Tom":     28,
		"Jerry":   22,
		"Charlie": 22,
		"Bob":     30,
	}
	for name, age := range boys {
		fmt.Printf("%s is %d years old\n", name, age)
	}

	fmt.Printf("Average age: %.2f\n", averageAge(boys))
	fmt.Printf("Oldest person: %s\n", oldestPerson(boys))

	fmt.Println("Youngest person:", youngestPerson(people))
	fmt.Println("Youngest person:", youngestPerson(boys))

	fmt.Println("Youngest persons:", youngestPersons(boys))

	fmt.Println("Oldest persons:", oldestPersons(boys))

	fmt.Println("Sorted persons:", sortPerson(boys))

	fmt.Println("Find by job:", findByJob(map[string]PersonNew{
		"Alice":   {Age: 25, Gender: "Female", Job: "Engineer"},
		"Bob":     {Age: 30, Gender: "Male", Job: "Designer"},
		"Charlie": {Age: 22, Gender: "Male", Job: "Engineer"},
	}, "Engineer"))

	fmt.Println("Find first N:", findFirstN(map[string]PersonNew{
		"Alice":   {Age: 25, Gender: "Female", Job: "Engineer"},
		"Bob":     {Age: 30, Gender: "Male", Job: "Designer"},
		"Charlie": {Age: 22, Gender: "Male", Job: "Engineer"},
	}, 2, 20))

	fmt.Println("Find first N:", findFirstNByJob(map[string]PersonNew{
		"Alice":   {Age: 25, Gender: "Female", Job: "Engineer"},
		"Bob":     {Age: 30, Gender: "Male", Job: "Designer"},
		"Charlie": {Age: 22, Gender: "Male", Job: "Engineer"},
	}, 2, "Engineer"))
}

// averageAge 计算姓名到年龄映射中的平均年龄。
func averageAge(m map[string]int) float64 {
	var total int
	for _, age := range m {
		total += age
	}
	return float64(total) / float64(len(m))
}

// oldestPerson 返回年龄最大的人的姓名。
func oldestPerson(m map[string]int) string {
	var oldestName string
	var oldestAge int
	for name, age := range m {
		if age > oldestAge {
			oldestAge = age
			oldestName = name
		}
	}
	return oldestName
}

// youngestPerson 返回年龄最小的人的姓名，空数据时返回提示文本。
func youngestPerson(m map[string]int) string {
	if len(m) == 0 {
		return "No data"
	}
	var youngestName string
	youngestAge := math.MaxInt // 初始值设为最大整数
	for name, age := range m {
		if age < youngestAge {
			youngestAge = age
			youngestName = name
		}
	}
	return youngestName
}

// youngestPersons 返回所有并列最年轻的人员姓名。
func youngestPersons(m map[string]int) []string {
	if len(m) == 0 {
		return []string{"No data"}
	}

	youngestAge := math.MaxInt
	var youngestPeople []string

	for name, age := range m {
		if age < youngestAge {
			youngestAge = age
			youngestPeople = []string{name} // 重置为当前最小的人
		} else if age == youngestAge {
			youngestPeople = append(youngestPeople, name) // 添加同龄人
		}
	}
	return youngestPeople
}

// oldestPersons 返回所有并列最年长的人员及其年龄。
func oldestPersons(m map[string]int) map[string]int {
	if len(m) == 0 {
		return map[string]int{}
	}
	var result = map[string]int{}
	var oldestAge int

	for name, age := range m {
		if age > oldestAge {
			oldestAge = age
			result = map[string]int{name: age} // 重置结果
		} else if age == oldestAge {
			result[name] = age // 添加同龄人
		}
	}
	return result
}

// Person 表示用于排序示例的人员信息。
type Person struct {
	name string
	age  int
}

// sortPerson 按年龄降序、姓名升序返回人员列表。
func sortPerson(m map[string]int) []Person {
	if len(m) == 0 {
		return []Person{}
	}
	var result = make([]Person, 0, len(m))
	for name, age := range m {
		result = append(result, Person{name, age})
	}
	sort.Slice(result, func(i, j int) bool {
		// 先按照age排序再按照name排序
		return result[i].age > result[j].age || (result[i].age == result[j].age && result[i].name < result[j].name)
	})
	return result
}

// PersonNew 表示带性别和职业字段的人员信息。
type PersonNew struct {
	Age    int
	Gender string
	Job    string
}

// findByJob 查找指定职业的人员姓名。
func findByJob(m map[string]PersonNew, job string) []string {
	var result = make([]string, 0, len(m))
	for name, item := range m {
		if item.Job == job {
			result = append(result, name)
		}
	}
	return result
}

// findFirstN 查找年龄大于 minAge 的前 N 个人员姓名。
func findFirstN(m map[string]PersonNew, n int, minAge int) []string {
	result := make([]string, 0, n)
	count := 0

	for name, item := range m {
		if item.Age > minAge {
			result = append(result, name)
			count++
			if count >= n {
				break
			}
		}
	}
	return result
}

// findFirstNByJob 查找指定职业的前 N 个人员姓名。
func findFirstNByJob(m map[string]PersonNew, n int, job string) []string {
	result := make([]string, 0, n)
	count := 0
	for name, item := range m {
		if item.Job == job {
			result = append(result, name)
			count++
		}
		if count >= n {
			break
		}
	}
	return result
}
