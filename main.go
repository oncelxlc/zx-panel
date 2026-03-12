package main

import (
	"fmt"
	"math"
	"sort"
)

func main() {
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
}

func averageAge(m map[string]int) float64 {
	var total int
	for _, age := range m {
		total += age
	}
	return float64(total) / float64(len(m))
}

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

type Person struct {
	name string
	age  int
}

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

type PersonNew struct {
	Age    int
	Gender string
	Job    string
}

func findByJob(m map[string]PersonNew, job string) []string {
	var result = make([]string, 0, len(m))
	for name, item := range m {
		if item.Job == job {
			result = append(result, name)
		}
	}
	return result
}
