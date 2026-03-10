package main

import "fmt"

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
		"Tom":   28,
		"Jerry": 26,
	}
	for name, age := range boys {
		fmt.Printf("%s is %d years old\n", name, age)
	}

	fmt.Printf("Average age: %.2f\n", averageAge(people))
	fmt.Printf("Oldest person: %s\n", oldestPerson(people))
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
